import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/jwt';
import { verifyCsrfToken } from '@/lib/csrf';
import { createClient } from '@supabase/supabase-js';
import {
  assignRow,
  getInsurerType,
  getInsurerTypeFromRows,
  ASSIGN_DEPARTMENTS,
  SELECTABLE_REGIONS,
  REGION_CHOICES,
  type SelectableRegion,
  isExcludedColumn,
  dedupeByOrderNumber,
  dedupeByCustomerKey,
  findRequiredColumns,
  getMissingColumnLabels,
  pendingRowKey,
  isOrderNumberMissing,
  ORDER_NUMBER_MISSING_REASON,
} from '@/lib/insurance';
import { formatCellValue } from '@/lib/excelCell';
import * as XLSX from 'xlsx';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const CATEGORIES = [...ASSIGN_DEPARTMENTS];

/** 업로드 라우트와 같은 한도. 여기가 느슨하면 업로드 전에 서버가 먼저 주저앉는다. */
const MAX_FILE_SIZE = 300 * 1024 * 1024;
/** 한 번에 처리할 파일 수. 없으면 수백 개를 한 요청에 밀어넣을 수 있다. */
const MAX_FILES = 30;

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

    if (uploadedFiles.length > MAX_FILES) {
      return NextResponse.json(
        { error: `한 번에 ${MAX_FILES}개까지 분류할 수 있습니다. (선택: ${uploadedFiles.length}개)` },
        { status: 400 }
      );
    }

    const tooBig = uploadedFiles.find((f) => f.size > MAX_FILE_SIZE);
    if (tooBig) {
      return NextResponse.json(
        { error: `${tooBig.name}: 파일 크기는 ${MAX_FILE_SIZE / (1024 * 1024)}MB를 넘을 수 없습니다.` },
        { status: 400 }
      );
    }

    // 상담메모 규칙 (업로드 화면 체크박스). 없으면 끈 것으로 본다.
    const memoRuleOn = formData.get('memoRule') === 'true';
    // 규칙이 보는 "오늘". 요청 안에서 한 번만 재야 파일마다 기준이 갈리지 않는다.
    const classifiedAt = new Date();

    // 부서 조회 (분류명 → 부서ID 변환용)
    const { data: departments } = await supabase
      .from('departments')
      .select('id, name')
      .in('name', CATEGORIES);

    const deptMap: Record<string, number> = {};
    for (const dept of departments ?? []) {
      deptMap[dept.name] = dept.id;
    }

    // 파일별 결과
    const perFile: any[] = [];

    // 전체 합산 (배포 시 전달용)
    const mergedCounts = emptyCounts();
    let mergedTotalRows = 0;
    let mergedErrorCount = 0;
    let mergedDupRemovedCount = 0;

    for (let fileIdx = 0; fileIdx < uploadedFiles.length; fileIdx++) {
      const file = uploadedFiles[fileIdx];
      // 한 개씩 읽는다. 미리 전부 읽어두면 고른 파일 크기의 합이 그대로 메모리에 올라간다.
      const buffer = await file.arrayBuffer();

      // cellDates를 주지 않으면 날짜 셀이 46245 같은 일련번호로 들어온다.
      const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true });
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

      const cols = findRequiredColumns(headers);
      const missingColumns = getMissingColumnLabels(cols);

      // 컬럼이 하나라도 없으면 중복 제거나 분류를 제대로 못 한다.
      // 조용히 건너뛰면 중복이 그대로 배포되므로 여기서 막는다.
      if (missingColumns.length > 0) {
        return NextResponse.json(
          {
            error: `${file.name}: 필수 컬럼을 찾을 수 없습니다. (${missingColumns.join(', ')})`,
            details: {
              fileName: file.name,
              missingColumns,
              availableColumns: headers,
            },
          },
          { status: 400 }
        );
      }

      const { addressCol, juminCol, orderCol, nameCol, phoneCol, productCol } = cols as {
        [K in keyof typeof cols]: string;
      };
      // 상담메모는 없는 파일도 있다. 위 캐스팅에 섞으면 없는 걸 있다고 속이게 된다.
      const { memoCol } = cols;
      // 규칙이 꺼졌거나 상담메모 열이 없으면 undefined — assignRow가 규칙을 건너뛴다.
      // 엑셀 날짜 칸은 Date로 들어오므로 formatCellValue를 거친다. 그대로 넘기면
      // 1899년 타임존 오차로 하루 밀린다.
      const memoRuleFor = (row: Record<string, any>) =>
        memoRuleOn && memoCol
          ? { memo: formatCellValue(row[memoCol] ?? ''), now: classifiedAt }
          : undefined;

      const counts = emptyCounts();
      const rowsByCategory: Record<string, Record<string, any>[]> = CATEGORIES.reduce(
        (acc, c) => ({ ...acc, [c]: [] }),
        {}
      );
      const errorRows: Array<{ row: number; reason: string }> = [];

      // 중복 제거를 분류보다 먼저 한다.
      // 원본 행 번호를 함께 들고 다녀야 오류 보고가 실제 파일 위치를 가리킨다.
      const indexedRows = rawData.map((row, i) => ({ row, sourceRow: i + 2 }));

      // 1) 주문번호 기준
      const { items: dedupedByOrder, removed: removedByOrder } = dedupeByOrderNumber(
        indexedRows,
        (entry) => entry.row[orderCol]
      );

      // 2) 고객 기준 (전화 + 이름 + 보험사)
      const { items: dedupedRows, removed: removedByCustomer } = dedupeByCustomerKey(
        dedupedByOrder,
        (entry) => entry.row[nameCol],
        (entry) => entry.row[phoneCol],
        (entry) => entry.row[productCol]
      );

      const duplicateRows = [...removedByOrder, ...removedByCustomer];
      const dupRemovedCount = duplicateRows.length;

      // 보험사 판정 — 배정 규칙이 갈리므로 분류보다 먼저 정한다.
      const insurerType = getInsurerTypeFromRows(
        dedupedRows.map(({ row }) => [String(row[productCol] ?? '')]),
        0
      );

      if (!insurerType) {
        return NextResponse.json(
          {
            error: `${file.name}: 상품명에서 보험사(동양/흥국)를 가릴 수 없습니다. 한 파일에 두 보험사가 섞여 있는지 확인해주세요.`,
          },
          { status: 400 }
        );
      }

      // 사람이 부서를 골라야 하는 건은 지역별로 세어둔다.
      // 배정이 안 끝난 상태라 counts에는 넣지 않는다.
      const pendingByRegion: Record<string, number> = {};
      const pendingRowsByRegion: Record<string, Record<string, any>[]> = {};
      // 행을 가리키는 키. 화면은 지역별로 묶어 보여주고 배포는 파일 행 순서로 도는데,
      // 위치 번호로 주고받으면 이 둘이 어긋나 엉뚱한 사람이 다른 부서로 간다.
      const pendingKeysByRegion: Record<string, string[]> = {};
      // 자동 배분이 생년월일 순으로 나누므로 그 값도 함께 보낸다.
      // 화면은 어느 열이 생년월일인지 모르기 때문에 여기서 뽑아 줘야 한다.
      const pendingJuminByRegion: Record<string, string[]> = {};
      for (const region of SELECTABLE_REGIONS) {
        pendingByRegion[region] = 0;
        pendingRowsByRegion[region] = [];
        pendingKeysByRegion[region] = [];
        pendingJuminByRegion[region] = [];
      }

      for (let dedupedIndex = 0; dedupedIndex < dedupedRows.length; dedupedIndex++) {
        const { row, sourceRow } = dedupedRows[dedupedIndex];
        try {
          // 주문번호가 없으면 배정 전에 막는다. 이 건을 가리킬 방법이 없어
          // 내보낸 뒤에는 어느 행이었는지 되짚을 수 없다.
          if (isOrderNumberMissing(row[orderCol])) {
            errorRows.push({ row: sourceRow, reason: ORDER_NUMBER_MISSING_REASON });
            continue;
          }

          const assigned = assignRow(insurerType, row[juminCol], row[addressCol], memoRuleFor(row));

          if (assigned.kind === 'error') {
            errorRows.push({ row: sourceRow, reason: assigned.reason });
          } else if (assigned.kind === 'select') {
            pendingByRegion[assigned.region]++;
            pendingRowsByRegion[assigned.region].push(row);
            pendingKeysByRegion[assigned.region].push(pendingRowKey(row[orderCol], dedupedIndex));
            pendingJuminByRegion[assigned.region].push(String(row[juminCol] ?? ''));
          } else if (counts.hasOwnProperty(assigned.dept)) {
            counts[assigned.dept]++;
            rowsByCategory[assigned.dept].push(row);
          } else {
            errorRows.push({ row: sourceRow, reason: `알 수 없는 분류: ${assigned.dept}` });
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

      // 미리보기는 JSON으로 나가므로 Date를 문자열로 바꿔둔다.
      // 안 바꾸면 UTC ISO 문자열이 되어 하루 어긋나 보인다.
      const toRowArrays = (rows: Record<string, any>[]) =>
        rows.map((row) => previewHeaders.map((key) => formatCellValue(row[key] ?? '')));

      // 분류 결과 시트 / 중복 시트 생성 (미리보기용)
      // 어느 단계에서 빠졌는지까지 들고 있어야 배포 결과와 사유가 어긋나지 않는다.
      const duplicateReasonByRow = new Map<number, string>([
        ...removedByOrder.map((entry) => [entry.sourceRow, '주문번호 중복'] as const),
        ...removedByCustomer.map(
          (entry) => [entry.sourceRow, '고객 중복 (tel2+고객명+상품명)'] as const
        ),
      ]);

      const processedRows: any[][] = [];
      const processedDuplicateRows: any[][] = [];
      let seq = 1;

      for (let i = 0; i < rawData.length; i++) {
        const row = rawData[i];
        const sourceRow = i + 2; // 헤더는 1행, 데이터는 2행부터
        const keptRow = previewHeaders.map((key) => formatCellValue(row[key] ?? ''));

        const duplicateReason = duplicateReasonByRow.get(sourceRow);
        if (duplicateReason) {
          processedDuplicateRows.push([duplicateReason, ...keptRow]);
          continue;
        }

        const assigned = assignRow(insurerType, row[juminCol], row[addressCol], memoRuleFor(row));
        // 아직 안 고른 건은 '미정'이다. 여기 지역명을 넣으면 '선택: 인천'처럼
        // 소속 칸에 소속이 아닌 값이 들어가 무엇이 배정된 건지 헷갈린다.
        // 어느 지역인지는 아래 선택 화면에서 지역별로 묶어 보여준다.
        const label =
          assigned.kind === 'error'
            ? '오류'
            : assigned.kind === 'select'
              ? '미정'
              : assigned.dept;
        // 배정방식은 "누가 정하는가"다. 아직 안 골랐어도 이 건은 사람이 고를 것이
        // 확정돼 있으므로 배포 전후로 값이 같다. 여기에 '미정'을 넣으면
        // 바로 옆 배정소속과 같은 말을 두 번 하게 된다.
        const assignedBy =
          assigned.kind === 'error' ? '' : assigned.kind === 'select' ? '직접분류' : '자동분류';
        processedRows.push([seq++, label, assignedBy, ...keptRow]);
      }

      // 분류 건수 / 행 데이터를 부서ID 기준으로 변환
      const classificationByDeptId: Record<number, number> = {};
      const rowsByDeptId: Record<number, any[][]> = {};
      for (const category of CATEGORIES) {
        const deptId = deptMap[category];
        if (!deptId) continue;
        classificationByDeptId[deptId] = counts[category];
        rowsByDeptId[deptId] = toRowArrays(rowsByCategory[category]);
      }

      // 미리보기용: 지역별 대기 건의 행 데이터
      const pendingRowsByRegionArrays: Record<string, any[][]> = {};
      for (const region of SELECTABLE_REGIONS) {
        pendingRowsByRegionArrays[region] = toRowArrays(pendingRowsByRegion[region]);
      }

      perFile.push({
        fileName: file.name,
        insurerType,
        // 사람이 부서를 골라야 하는 지역과 건수
        pendingByRegion,
        pendingRowsByRegion: pendingRowsByRegionArrays,
        pendingKeysByRegion,
        pendingJuminByRegion,
        // 원본 데이터는 중복 제거 전 (업로드 당시 그대로)
        totalRows: rawData.length,
        dupRemovedCount,
        classification: counts,
        classificationByDeptId,
        errors: errorRows,
        errorCount: errorRows.length,
        previewHeaders,
        // 미리보기마다 열 구성이 다르다. 헤더를 행 배열 안에 끼워 넣으면
        // 받는 쪽이 thead를 또 그려서 설명 행이 두 줄로 보인다.
        processedHeaders: ['번호', '배정소속', '배정방식', ...previewHeaders],
        duplicateHeaders: ['중복사유', ...previewHeaders],
        rowsByDeptId,
        // 미리보기는 원본 그대로 (중복 포함)
        originalRows: toRowArrays(rawData),
        // 분류 결과 / 중복 시트
        processedRows,
        duplicateRows: processedDuplicateRows,
      });

      // 합산 (원본 기준)
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
      // 지역별 고를 수 있는 부서. UI가 목록을 따로 들고 있으면 규칙이 갈라진다.
      regionChoices: REGION_CHOICES,
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
