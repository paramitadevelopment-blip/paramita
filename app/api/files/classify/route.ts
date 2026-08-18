import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/jwt';
import { verifyCsrfToken } from '@/lib/csrf';
import { createClient } from '@supabase/supabase-js';
import { classifyRow, isExcludedColumn, dedupeByOrderNumber } from '@/lib/insurance';
import * as XLSX from 'xlsx';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const CATEGORIES = ['70세이상', '한울부원', '굿모닝제너럴', '경기', '수도권', '이외지역'];

function emptyCounts(): Record<string, number> {
  return CATEGORIES.reduce((acc, c) => ({ ...acc, [c]: 0 }), {});
}

export async function POST(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!verifyCsrfToken(request)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const formData = await request.formData();
    // 여러 파일 업로드 지원 (단일 'file' 키도 호환)
    const uploadedFiles = [
      ...(formData.getAll('files') as File[]),
      ...(formData.getAll('file') as File[]),
    ].filter((f): f is File => !!f && typeof (f as File).arrayBuffer === 'function');

    if (uploadedFiles.length === 0) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // 부서 조회 (분류명 → 부서ID 변환용)
    const { data: departments } = await supabase
      .from('departments')
      .select('id, name')
      .in('name', CATEGORIES);

    const deptMap: Record<string, number> = {};
    for (const dept of departments ?? []) {
      deptMap[dept.name] = dept.id;
    }

    // 병렬: 모든 파일의 arrayBuffer 읽기
    const buffers = await Promise.all(
      uploadedFiles.map((file) => file.arrayBuffer())
    );

    // 파일별 결과
    const perFile: any[] = [];

    // 전체 합산 (배포 시 전달용)
    const mergedCounts = emptyCounts();
    let mergedTotalRows = 0;
    let mergedErrorCount = 0;
    let mergedDupRemovedCount = 0;

    for (let fileIdx = 0; fileIdx < uploadedFiles.length; fileIdx++) {
      const file = uploadedFiles[fileIdx];
      const buffer = buffers[fileIdx];

      const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rawData = XLSX.utils.sheet_to_json(worksheet) as Record<string, any>[];

      if (!Array.isArray(rawData) || rawData.length === 0) {
        return NextResponse.json(
          { error: `${file.name}: 파일에 데이터가 없습니다.` },
          { status: 400 }
        );
      }

      // 헤더에서 필수 컬럼 찾기 (파일마다 개별 판정)
      const headers = Object.keys(rawData[0] || {});

      let addressCol: string | null = null;
      let juminCol: string | null = null;
      let orderCol: string | null = null;

      for (const header of headers) {
        const h = header.toLowerCase().trim();
        if (!addressCol && (h.includes('주소') || h === 'address')) {
          addressCol = header;
        }
        if (!juminCol && (h.includes('생년월일') || h === 'jumin' || h === 'birthday')) {
          juminCol = header;
        }
        if (!orderCol && (h.includes('주문번호') || h === 'ordernumber' || h === 'order_no')) {
          orderCol = header;
        }
      }

      // 주문번호가 없으면 중복 제거를 못 한다.
      // 조용히 건너뛰면 중복이 그대로 배포되므로 여기서 막는다.
      if (!addressCol || !juminCol || !orderCol) {
        return NextResponse.json(
          {
            error: `${file.name}: 필수 컬럼을 찾을 수 없습니다.`,
            details: {
              fileName: file.name,
              addressFound: !!addressCol,
              juminFound: !!juminCol,
              orderFound: !!orderCol,
              availableColumns: headers,
            },
          },
          { status: 400 }
        );
      }

      const counts = emptyCounts();
      const rowsByCategory: Record<string, Record<string, any>[]> = CATEGORIES.reduce(
        (acc, c) => ({ ...acc, [c]: [] }),
        {}
      );
      const errorRows: Array<{ row: number; reason: string }> = [];

      // 주문번호 기준 중복 제거를 분류보다 먼저 한다.
      // 원본 행 번호를 함께 들고 다녀야 오류 보고가 실제 파일 위치를 가리킨다.
      const indexedRows = rawData.map((row, i) => ({ row, sourceRow: i + 2 }));
      const { items: dedupedRows, removedCount: dupRemovedCount } = dedupeByOrderNumber(
        indexedRows,
        (entry) => entry.row[orderCol]
      );

      for (const { row, sourceRow } of dedupedRows) {
        try {
          const category = classifyRow(row, addressCol, juminCol);

          if (category === 'error') {
            errorRows.push({ row: sourceRow, reason: '생년월일 형식 오류' });
          } else if (counts.hasOwnProperty(category)) {
            counts[category]++;
            rowsByCategory[category].push(row);
          } else {
            errorRows.push({ row: sourceRow, reason: `알 수 없는 분류: ${category}` });
          }
        } catch (e) {
          errorRows.push({ row: sourceRow, reason: String(e) });
        }
      }

      // 미리보기/배포용 컬럼 목록 (이 파일의 모든 행 키를 순서대로 합침)
      // 내부 관리용 열은 업체에 넘기지 않으므로 여기서 뺀다.
      // 분류는 원본 row에서 직접 읽으므로 이 필터의 영향을 받지 않는다.
      const previewHeaders: string[] = [];
      for (const row of rawData) {
        for (const key of Object.keys(row)) {
          if (!previewHeaders.includes(key) && !isExcludedColumn(key)) {
            previewHeaders.push(key);
          }
        }
      }

      const toRowArrays = (rows: Record<string, any>[]) =>
        rows.map((row) => previewHeaders.map((key) => row[key] ?? ''));

      // 분류 건수 / 행 데이터를 부서ID 기준으로 변환
      const classificationByDeptId: Record<number, number> = {};
      const rowsByDeptId: Record<number, any[][]> = {};
      for (const category of CATEGORIES) {
        const deptId = deptMap[category];
        if (!deptId) continue;
        classificationByDeptId[deptId] = counts[category];
        rowsByDeptId[deptId] = toRowArrays(rowsByCategory[category]);
      }

      perFile.push({
        fileName: file.name,
        totalRows: rawData.length,
        dupRemovedCount,
        classification: counts,
        classificationByDeptId,
        errors: errorRows,
        errorCount: errorRows.length,
        previewHeaders,
        rowsByDeptId,
        // 원본도 중복이 제거된 상태로 내려간다.
        originalRows: toRowArrays(dedupedRows.map((entry) => entry.row)),
      });

      // 합산
      for (const category of CATEGORIES) {
        mergedCounts[category] += counts[category];
      }
      mergedTotalRows += rawData.length;
      mergedErrorCount += errorRows.length;
      mergedDupRemovedCount += dupRemovedCount;
    }

    // 합산 결과를 부서ID 기준으로 변환 (배포 요청에 전달)
    const mergedByDeptId: Record<number, number> = {};
    for (const category of CATEGORIES) {
      const deptId = deptMap[category];
      if (deptId) {
        mergedByDeptId[deptId] = mergedCounts[category];
      }
    }

    return NextResponse.json({
      success: true,
      fileCount: uploadedFiles.length,
      files: perFile,
      totalRows: mergedTotalRows,
      classification: mergedCounts,
      classificationByDeptId: mergedByDeptId,
      errorCount: mergedErrorCount,
      dupRemovedCount: mergedDupRemovedCount,
    });
  } catch (error) {
    console.error('Classification error:', error);
    return NextResponse.json(
      { error: '파일 분류 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
