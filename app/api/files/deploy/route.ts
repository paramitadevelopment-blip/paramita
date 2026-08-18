import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/jwt';
import { verifyCsrfToken } from '@/lib/csrf';
import { createClient } from '@supabase/supabase-js';
import { classifyRow, isExcludedColumn, dedupeByOrderNumber } from '@/lib/insurance';
import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Only admin can deploy files' }, { status: 403 });
    }

    // CSRF 토큰 검증
    if (!verifyCsrfToken(request)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const body = await request.json();
    const { files, classificationResults } = body;

    if (!files || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    if (!classificationResults || typeof classificationResults !== 'object') {
      return NextResponse.json({ error: 'No classification results provided' }, { status: 400 });
    }

    // 모든 부서 조회 (관리자 제외)
    const { data: departments, error: deptError } = await supabase
      .from('departments')
      .select('id, name')
      .neq('name', '관리자');

    if (deptError || !departments || departments.length === 0) {
      console.error('Failed to fetch departments:', deptError);
      return NextResponse.json({ error: 'Failed to fetch departments' }, { status: 500 });
    }

    // 각 파일에 대해 모든 부서별로 복사본 생성
    const fileRecords = [];
    const STORAGE_BUCKET = 'files';

    // 병렬: 모든 파일 정보 조회
    const fileDataResults = await Promise.all(
      files.map((fileId) =>
        supabase
          .from('files')
          .select('*')
          .eq('id', fileId)
          .single()
      )
    );

    // 에러 확인 및 원본 파일 데이터 수집
    const originalFiles: Array<{ id: string; data: any }> = [];
    for (let i = 0; i < fileDataResults.length; i++) {
      const { data: originalFile, error: fileError } = fileDataResults[i];
      if (fileError || !originalFile) {
        console.error('File not found:', fileError);
        return NextResponse.json({ error: `File ${files[i]} not found` }, { status: 404 });
      }
      originalFiles.push({ id: files[i], data: originalFile });
    }

    // 병렬: Storage에서 모든 원본 파일 다운로드
    const downloadResults = await Promise.all(
      originalFiles.map(({ data: originalFile }) =>
        supabase.storage
          .from(STORAGE_BUCKET)
          .download(originalFile.storage_path)
      )
    );

    // 다운로드 에러 확인
    for (let i = 0; i < downloadResults.length; i++) {
      const { error: downloadError } = downloadResults[i];
      if (downloadError) {
        console.error('Failed to download original file:', downloadError);
        return NextResponse.json(
          { error: `Failed to download file ${originalFiles[i].id}` },
          { status: 500 }
        );
      }
    }

    // 각 파일 처리
    for (let fileIdx = 0; fileIdx < originalFiles.length; fileIdx++) {
      const { data: originalFile } = fileDataResults[fileIdx];
      const { data: fileData } = downloadResults[fileIdx];

      if (!fileData) {
        console.error('File data is null');
        return NextResponse.json({ error: 'Failed to process file' }, { status: 500 });
      }

      // 원본 엑셀 파싱 (헤더 + 데이터 행)
      const buffer = await fileData.arrayBuffer();
      const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][];

      if (aoa.length < 2) {
        return NextResponse.json({ error: `File ${originalFile.name} has no data` }, { status: 400 });
      }

      const headerRow = aoa[0].map((h) => String(h ?? ''));
      const dataRows = aoa.slice(1);

      // 필수 컬럼 위치 찾기 (classify와 동일한 기준)
      let addressIdx = -1;
      let juminIdx = -1;
      let orderIdx = -1;
      headerRow.forEach((header, idx) => {
        const h = header.toLowerCase().trim();
        if (addressIdx === -1 && (h.includes('주소') || h === 'address')) addressIdx = idx;
        if (juminIdx === -1 && (h.includes('생년월일') || h === 'jumin' || h === 'birthday')) juminIdx = idx;
        if (orderIdx === -1 && (h.includes('주문번호') || h === 'ordernumber' || h === 'order_no')) orderIdx = idx;
      });

      if (addressIdx === -1 || juminIdx === -1 || orderIdx === -1) {
        return NextResponse.json(
          { error: `${originalFile.name}: 주소/생년월일/주문번호 컬럼을 찾을 수 없습니다.` },
          { status: 400 }
        );
      }

      // 주문번호 기준 중복 제거 (분류보다 먼저)
      const { items: dedupedRows } = dedupeByOrderNumber(dataRows, (row) => row[orderIdx]);

      // 업체에 넘기지 않을 열을 빼고 남길 열 위치만 추린다.
      const keptIdx = headerRow
        .map((header, idx) => ({ header, idx }))
        .filter(({ header }) => !isExcludedColumn(header))
        .map(({ idx }) => idx);
      const keptHeader = keptIdx.map((idx) => headerRow[idx]);

      // 행별 분류 → 분류명 기준으로 행 묶기 (서버에서 재계산, 클라이언트 값 신뢰 안 함)
      // 동시에 원본 시트2에 넣을 가공본을 만든다.
      const rowsByCategory: Record<string, any[][]> = {};
      const processedRows: any[][] = [];
      let seq = 1;

      for (const row of dedupedRows) {
        const category = classifyRow(
          { address: row[addressIdx], jumin: row[juminIdx] },
          'address',
          'jumin'
        );

        const keptRow = keptIdx.map((idx) => row[idx] ?? '');

        // 배정 실패 건도 가공본에는 남긴다. 조용히 사라지면 추적이 안 된다.
        processedRows.push([seq++, category === 'error' ? '오류' : category, ...keptRow]);

        if (category === 'error') continue;
        if (!rowsByCategory[category]) rowsByCategory[category] = [];
        rowsByCategory[category].push(keptRow);
      }

      // 원본파일을 시트 2장으로 다시 저장한다.
      //   Sheet1 = 업로드한 원본 그대로
      //   Sheet2 = 번호 + 배정소속이 붙은 가공본
      const xlsxMimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const rebuiltWorkbook = XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(rebuiltWorkbook, XLSX.utils.aoa_to_sheet(aoa), '원본');
      XLSX.utils.book_append_sheet(
        rebuiltWorkbook,
        XLSX.utils.aoa_to_sheet([['번호', '배정소속', ...keptHeader], ...processedRows]),
        '분류 결과'
      );

      const rebuiltBuffer: Buffer = XLSX.write(rebuiltWorkbook, {
        type: 'buffer',
        bookType: 'xlsx',
      });

      const { error: rebuildUploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(originalFile.storage_path, rebuiltBuffer, {
          contentType: xlsxMimeType,
          upsert: true,
        });

      if (rebuildUploadError) {
        console.error('Failed to rewrite original file:', rebuildUploadError);
        return NextResponse.json(
          { error: `${originalFile.name}: 원본 파일 저장에 실패했습니다.` },
          { status: 500 }
        );
      }

      // 시트가 늘어 용량이 바뀌었으므로 갱신한다.
      const { error: sizeUpdateError } = await supabase
        .from('files')
        .update({ size: rebuiltBuffer.byteLength })
        .eq('id', originalFiles[fileIdx].id);

      if (sizeUpdateError) {
        console.error('Failed to update original file size:', sizeUpdateError);
      }

      // 각 부서별로 해당 행만 담은 파일 생성
      const uploadPromises: Array<{
        promise: Promise<any>;
        record: any
      }> = [];

      for (const dept of departments) {
        const deptRows = rowsByCategory[dept.name];
        if (!deptRows || deptRows.length === 0) continue; // 배정된 행이 없으면 스킵

        const newFileId = uuidv4();
        const timestamp = new Date().toISOString();

        // 해당 부서의 행만으로 새 워크북 생성 (정리된 열만)
        const newSheet = XLSX.utils.aoa_to_sheet([keptHeader, ...deptRows]);
        const newWorkbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(newWorkbook, newSheet, 'Sheet1');
        const outBuffer: Buffer = XLSX.write(newWorkbook, { type: 'buffer', bookType: 'xlsx' });

        // 파일 내용 인덱싱: 배포 파일의 행들을 객체로 변환
        const fileContentRows = deptRows.map((row) => {
          const obj: any = {};
          keptHeader.forEach((header, idx) => {
            obj[header] = row[idx] ?? '';
          });
          return obj;
        });

        // 파일명: 원본명_부서명
        const baseFileName = originalFile.name.replace(/\.[^/.]+$/, '');
        const newFileName = `${baseFileName}_${dept.name}.xlsx`;
        // Storage 경로: 부서 ID 사용 (한글 문제 해결)
        const newStoragePath = `dept/${dept.id}/${timestamp.slice(0, 10)}/${newFileId}.xlsx`;

        const record = {
          id: newFileId,
          name: newFileName,
          size: outBuffer.byteLength,
          mime_type: xlsxMimeType,
          storage_path: newStoragePath,
          uploaded_by: originalFile.uploaded_by,
          uploaded_at: originalFile.uploaded_at,
          download_count: 0,
          department_id: dept.id,
          is_original: false,
          original_file_id: originalFiles[fileIdx].id,
          file_content: fileContentRows,
        };

        // 병렬 업로드 준비
        const uploadPromise = supabase.storage
          .from(STORAGE_BUCKET)
          .upload(newStoragePath, outBuffer, {
            contentType: xlsxMimeType,
            upsert: false,
          });

        uploadPromises.push({ promise: uploadPromise, record });
      }

      // 병렬 업로드 실행 및 에러 처리
      const uploadResults = await Promise.all(
        uploadPromises.map(({ promise }) => promise)
      );

      for (let i = 0; i < uploadResults.length; i++) {
        const { error: uploadError } = uploadResults[i];
        const { record } = uploadPromises[i];

        if (uploadError) {
          console.error('Failed to upload split file:', uploadError);
          return NextResponse.json(
            { error: `Failed to deploy file to department ${record.department_id}` },
            { status: 500 }
          );
        }

        fileRecords.push(record);
      }
    }

    if (fileRecords.length === 0) {
      return NextResponse.json({ error: 'No files to deploy' }, { status: 400 });
    }

    // 배포된 파일들을 DB에 저장
    const { data, error } = await supabase
      .from('files')
      .insert(fileRecords)
      .select();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to save deployed files' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Files deployed successfully to all departments',
      deployedCount: fileRecords.length,
    });
  } catch (error) {
    console.error('File deployment error:', error);
    return NextResponse.json({ error: 'Failed to deploy file' }, { status: 500 });
  }
}
