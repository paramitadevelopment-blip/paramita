import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/jwt';
import { verifyCsrfToken } from '@/lib/csrf';
import { createClient } from '@supabase/supabase-js';
import {
  assignRow,
  REGION_CHOICES,
  type SelectableRegion,
  isExcludedColumn,
  dedupeByOrderNumber,
  dedupeByCustomerKey,
  findRequiredColumns,
  getMissingColumnLabels,
  getInsurerTypeFromRows,
  pendingRowKey,
  isOrderNumberMissing,
  ORDER_NUMBER_MISSING_REASON,
  ASSIGNED_BY_COLUMN,
  ASSIGNED_BY_RULE,
  ASSIGNED_BY_PERSON,
  ROW_NO_COLUMN,
  ASSIGNED_DEPT_COLUMN,
  ASSIGNED_AT_COLUMN,
  DUPLICATE_REASON_COLUMN,
  formatAssignedAt,
} from '@/lib/insurance';
import { formatCellValue, fitColumnWidths } from '@/lib/excelCell';
import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/** 분류 라우트와 같은 한도. 한쪽만 열어두면 그쪽으로 서버가 주저앉는다. */
const MAX_FILES = 30;

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
    const { files, classificationResults, rowAssignments, memoRule } = body;

    // 상담메모 규칙 (업로드 화면 체크박스). 분류할 때 켰으면 배포도 켜야 한다.
    const memoRuleOn = memoRule === true;

    // 행별 부서 선택은 파일 순서와 1:1로 맞춘 배열로 받는다.
    // 파일명으로 맞추면 같은 이름이 여러 개일 때 엉킨다.
    // 각 원소는 주문번호 → 부서명. 위치 번호로 받으면 화면(지역별 묶음)과
    // 여기(파일 행 순서)의 순서가 달라 선택이 엉뚱한 사람에게 붙는다.
    const assignmentsByFile: Array<Record<string, string>> =
      Array.isArray(rowAssignments) ? rowAssignments : [];

    if (!files || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `한 번에 ${MAX_FILES}개까지 배포할 수 있습니다. (요청: ${files.length}개)` },
        { status: 400 }
      );
    }

    if (!classificationResults || typeof classificationResults !== 'object') {
      return NextResponse.json({ error: 'No classification results provided' }, { status: 400 });
    }

    // 모든 부서 조회 (관리자 제외)
    const { data: departments, error: deptError } = await supabase
      .from('departments')
      .select('id, name')
      .eq('is_admin', false);

    if (deptError || !departments || departments.length === 0) {
      console.error('Failed to fetch departments:', deptError);
      return NextResponse.json({ error: 'Failed to fetch departments' }, { status: 500 });
    }

    // 각 파일에 대해 모든 부서별로 복사본 생성
    const fileRecords = [];
    const STORAGE_BUCKET = 'files';

    // 스토리지에 올린 경로. 도중에 실패하면 여기 있는 것들을 다시 지운다.
    // DB 기록 없이 남으면 화면에서 찾을 수도 지울 수도 없는데, 그 안에는
    // 고객 개인정보가 들어 있다.
    const uploadedPaths: string[] = [];
    const cleanupUploads = async () => {
      if (uploadedPaths.length === 0) return;
      const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(uploadedPaths);
      if (error) console.error('Failed to clean up deployed files:', error);
    };

    // 상담메모 규칙의 "오늘". 파일마다 다시 재면 처리 도중 11시를 넘길 때 갈린다.
    const deployedAt = new Date();

    // 병렬: 모든 파일 정보 조회
    const fileDataResults = await Promise.all(
      files.map((fileId) =>
        supabase
          .from('files')
          // file_content는 엑셀 전체 사본이라 파일당 수백 kB다. 여기서는 안 쓰므로 빼야
          // 파일을 여러 개 배포할 때 쓰지도 않을 데이터가 통째로 메모리에 올라오지 않는다.
          .select('id, name, storage_path, uploaded_by, uploaded_at')
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

    // 각 파일 처리
    for (let fileIdx = 0; fileIdx < originalFiles.length; fileIdx++) {
      // 위에서 null을 걸러낸 목록을 쓴다. fileDataResults는 아직 검사 전이라
      // 타입상 null이 섞여 있다.
      const originalFile = originalFiles[fileIdx].data;

      // 원본은 처리 직전에 하나씩 받는다. 미리 전부 받아두면 고른 파일 크기의
      // 합이 그대로 메모리에 올라가고, 첫 파일에서 실패해도 나머지를 이미 다 받은 뒤다.
      const { data: fileData, error: downloadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .download(originalFile.storage_path);

      if (downloadError || !fileData) {
        console.error('Failed to download original file:', downloadError);
        return NextResponse.json(
          { error: `Failed to download file ${originalFiles[fileIdx].id}` },
          { status: 500 }
        );
      }

      // 원본 엑셀 파싱 (헤더 + 데이터 행)
      const buffer = await fileData.arrayBuffer();
      // cellDates를 주지 않으면 날짜 셀이 46245 같은 일련번호로 들어오고,
      // 그 숫자가 그대로 배포 파일에 실려 받는 쪽에서도 숫자로 보인다.
      const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      // defval을 주면 빈 셀이 ''로 실체화된다. 그 AOA를 그대로 다시 저장하면
      // 원래 비어 있던 행이 ''만 가득한 데이터 행으로 되살아나 건수가 늘어난다.
      const aoa = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

      if (aoa.length < 2) {
        return NextResponse.json({ error: `File ${originalFile.name} has no data` }, { status: 400 });
      }

      // 원본 파일의 빈 열 필터링 (미리보기와 동일)
      const allHeaders = aoa[0]?.map((h) => String(h ?? '')) || [];
      const allRows = aoa.slice(1);
      const validColIndices: number[] = [];
      for (let i = 0; i < allHeaders.length; i++) {
        const headerIsEmpty = !allHeaders[i] || allHeaders[i].trim() === '';
        const allCellsEmpty = allRows.every((row) => !row?.[i] || String(row[i] ?? '').trim() === '');
        if (!headerIsEmpty || !allCellsEmpty) validColIndices.push(i);
      }

      const headerRow = validColIndices.map((i) => allHeaders[i]);
      const dataRows = allRows
        .map((row) => validColIndices.map((i) => row?.[i] ?? ''))
        .filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''));

      // 필수 컬럼 찾기 — classify와 반드시 같은 규칙을 써야 하므로 공용 함수를 쓴다.
      const cols = findRequiredColumns(headerRow);
      const missingColumns = getMissingColumnLabels(cols);

      if (missingColumns.length > 0) {
        return NextResponse.json(
          {
            error: `${originalFile.name}: 필수 컬럼을 찾을 수 없습니다. (${missingColumns.join(', ')})`,
          },
          { status: 400 }
        );
      }

      const addressIdx = headerRow.indexOf(cols.addressCol!);
      const juminIdx = headerRow.indexOf(cols.juminCol!);
      const orderIdx = headerRow.indexOf(cols.orderCol!);
      const nameIdx = headerRow.indexOf(cols.nameCol!);
      const phoneIdx = headerRow.indexOf(cols.phoneCol!);
      const productIdx = headerRow.indexOf(cols.productCol!);
      // 상담메모는 없는 파일도 있다. 없으면 -1.
      const memoIdx = cols.memoCol ? headerRow.indexOf(cols.memoCol) : -1;
      // 규칙이 꺼졌거나 상담메모 열이 없으면 undefined — assignRow가 규칙을 건너뛴다.
      // 엑셀 날짜 칸은 Date로 들어오므로 formatCellValue를 거친다. 그대로 넘기면
      // 1899년 타임존 오차로 하루 밀린다.
      const memoRuleFor = (row: any[]) =>
        memoRuleOn && memoIdx >= 0
          ? { memo: formatCellValue(row[memoIdx] ?? ''), now: deployedAt }
          : undefined;

      // 중복 제거 (분류보다 먼저) — classify와 같은 순서, 같은 기준
      const { items: dedupedByOrder, removed: removedByOrder } = dedupeByOrderNumber(
        dataRows,
        (row) => row[orderIdx]
      );
      const { items: dedupedRows, removed: removedByCustomer } = dedupeByCustomerKey(
        dedupedByOrder,
        (row) => row[nameIdx],
        (row) => row[phoneIdx],
        (row) => row[productIdx]
      );

      // 업체에 넘기지 않을 열을 빼고 남길 열 위치만 추린다.
      const keptIdx = headerRow
        .map((header, idx) => ({ header, idx }))
        .filter(({ header }) => !isExcludedColumn(header))
        .map(({ idx }) => idx);
      const keptHeader = keptIdx.map((idx) => headerRow[idx]);

      // 중복 시트에 넣을 행. 왜 빠졌는지 알아야 사람이 검증할 수 있으므로
      // 사유를 맨 앞 열에 따로 붙인다. 값에 섞으면 그 열을 다시 쓸 수 없다.
      const duplicateRows = [
        ...removedByOrder.map((row) => ['주문번호 중복', ...keptIdx.map((idx) => row[idx] ?? '')]),
        ...removedByCustomer.map((row) => [
          '고객 중복 (tel2+고객명+상품명)',
          ...keptIdx.map((idx) => row[idx] ?? ''),
        ]),
      ];

      // 분류 결과 시트에서 중복 행을 가려내기 위한 집합.
      // dataRows의 각 행은 고유한 배열 객체라 참조로 비교해도 안전하다.
      const duplicateSet = new Set<any[]>([...removedByOrder, ...removedByCustomer]);

      // 보험사 판정 — 배정 규칙이 갈리므로 분류보다 먼저 정해야 한다.
      // 열을 거르기 전 원본 행에서 보므로 productIdx를 그대로 쓴다.
      const insurerType = getInsurerTypeFromRows(dedupedRows, productIdx);

      if (!insurerType) {
        return NextResponse.json(
          {
            error: `${originalFile.name}: 상품명에서 보험사(동양/흥국)를 가릴 수 없습니다. 한 파일에 두 보험사가 섞여 있는지 확인해주세요.`,
          },
          { status: 400 }
        );
      }

      // 행별 분류 → 분류명 기준으로 행 묶기 (서버에서 재계산, 클라이언트 값 신뢰 안 함)
      // 분류 결과 시트는 중복이 제거된 행만 담는다.
      // 행과 함께 '누가 정했는지'를 들고 다닌다. 나중에 소속별로 나눌 때
      // 그 값을 DB에 실어야 관리자가 배포본을 열어볼 때 근거를 볼 수 있다.
      const rowsByCategory: Record<string, Array<{ row: any[]; assignedBy: string }>> = {};
      const processedRows: any[][] = [];
      // 원본의 DB 내용. 분류 결과와 같은 모양이되 제외 열(구분·방송사명 등)까지
      // 담는다. 원본은 관리자용이라 원래 갖고 있던 열로도 검색돼야 한다.
      const originalContent: any[] = [];
      let seq = 1;
      const picked = assignmentsByFile[fileIdx] ?? {};
      const unpickedRows: Array<{ region: SelectableRegion; key: string }> = [];
      // 주문번호가 없는 행. 분류 화면에서도 막지만 그건 UX일 뿐이라 여기서 다시 본다.
      const missingOrderRows: number[] = [];

      // 중복이 제거된 행만 순회 (dedupedRows)
      for (let dedupedIndex = 0; dedupedIndex < dedupedRows.length; dedupedIndex++) {
        const row = dedupedRows[dedupedIndex];
        const keptRow = keptIdx.map((idx) => row[idx] ?? '');

        // 주문번호가 없으면 이 건을 가리킬 방법이 없다. 아래에서 한꺼번에 막는다.
        if (isOrderNumberMissing(row[orderIdx])) {
          missingOrderRows.push(dedupedIndex);
          processedRows.push([seq++, '오류', '', ...keptRow]);
          continue;
        }

        const assigned = assignRow(insurerType, row[juminIdx], row[addressIdx], memoRuleFor(row));

        let category: string;
        // 규칙이 정했는지 사람이 골랐는지. 배포하고 나면 소속만 남아
        // "이 고객이 왜 여기로 갔나"를 되짚을 수 없어서 함께 적어 둔다.
        let assignedBy = ASSIGNED_BY_RULE;
        if (assigned.kind === 'error') {
          category = 'error';
        } else if (assigned.kind === 'select') {
          assignedBy = ASSIGNED_BY_PERSON;
          // 사람이 고른 부서. 클라이언트 값은 신뢰하지 않고,
          // 그 지역에 허용된 부서인지 여기서 다시 확인한다.
          const key = pendingRowKey(row[orderIdx], dedupedIndex);
          const choice = picked[key];
          if (choice && (REGION_CHOICES[assigned.region] as readonly string[]).includes(choice)) {
            category = choice;
          } else {
            // 안 골랐거나 그 지역에 없는 부서다. 아래에서 한꺼번에 막는다.
            unpickedRows.push({ region: assigned.region, key });
            category = 'error';
          }
        } else {
          category = assigned.dept;
        }

        const rowNo = seq++;
        const deptLabel = category === 'error' ? '오류' : category;
        processedRows.push([rowNo, deptLabel, category === 'error' ? '' : assignedBy, ...keptRow]);

        // 날짜 칸은 Date 객체다. 그대로 JSON에 넣으면 UTC ISO 문자열이 되어
        // 하루 어긋난 값으로 저장되고, 사람이 쓰는 표기로 검색해도 안 걸린다.
        const contentRow: any = {
          [ROW_NO_COLUMN]: rowNo,
          [ASSIGNED_DEPT_COLUMN]: deptLabel,
          [ASSIGNED_BY_COLUMN]: category === 'error' ? '' : assignedBy,
        };
        headerRow.forEach((header, i) => {
          contentRow[header] = formatCellValue(row[i] ?? '');
        });
        contentRow[ASSIGNED_AT_COLUMN] = formatAssignedAt(deployedAt);
        originalContent.push(contentRow);

        if (category === 'error') continue;
        if (!rowsByCategory[category]) rowsByCategory[category] = [];
        rowsByCategory[category].push({ row: keptRow, assignedBy });
      }

      // 중복으로 제외된 행도 DB에 담는다. 배포되진 않지만 고객 문의가 오면
      // "그 건은 중복이라 빠졌다"고 답할 수 있어야 하고, 검색에도 걸려야 한다.
      // 파일의 중복 시트와 같은 내용이다.
      for (const [reason, removed] of [
        ['주문번호 중복', removedByOrder],
        ['고객 중복 (tel2+고객명+상품명)', removedByCustomer],
      ] as const) {
        for (const row of removed) {
          const contentRow: any = {
            [ROW_NO_COLUMN]: '',
            [ASSIGNED_DEPT_COLUMN]: '중복 제외',
            [ASSIGNED_BY_COLUMN]: '',
            [DUPLICATE_REASON_COLUMN]: reason,
          };
          headerRow.forEach((header, i) => {
            contentRow[header] = formatCellValue(row[i] ?? '');
          });
          contentRow[ASSIGNED_AT_COLUMN] = formatAssignedAt(deployedAt);
          originalContent.push(contentRow);
        }
      }

      // 주문번호가 없는 행이 있으면 배포를 막는다. 내보낸 뒤에는 되짚을 수 없다.
      if (missingOrderRows.length > 0) {
        return NextResponse.json(
          {
            error: `${originalFile.name}: ${ORDER_NUMBER_MISSING_REASON}인 행이 있어 배포할 수 없습니다. (${missingOrderRows.length}건)`,
          },
          { status: 400 }
        );
      }

      // 배정하지 않은 row가 있으면 배포를 막는다.
      if (unpickedRows.length > 0) {
        const unpickedRegions = [...new Set(unpickedRows.map(r => r.region))];
        return NextResponse.json(
          {
            error: `${originalFile.name}: ${unpickedRegions.join(' · ')} 지역의 배정 부서를 고르지 않았습니다. (${unpickedRows.length}건)`,
          },
          { status: 400 }
        );
      }

      // 원본파일을 시트 3장으로 다시 저장한다.
      //   Sheet1 = 업로드한 원본 그대로
      //   Sheet2 = 번호 + 배정소속이 붙은 가공본
      //   Sheet3 = 중복으로 제외된 행 (사유 포함)
      // 중복 시트는 제외된 행이 없어도 헤더만 넣어 항상 만든다. 시트 구성이 파일마다
      // 달라지면 받는 쪽에서 "없는 건지 안 만든 건지" 구분이 안 된다.
      const xlsxMimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const rebuiltWorkbook = XLSX.utils.book_new();

      // 열 너비를 안 주면 기본값(8자 남짓)으로 저장돼, 날짜 칸이 ########으로 보인다.
      const toSheet = (rows: unknown[][]) => {
        const sheet = XLSX.utils.aoa_to_sheet(rows, { cellDates: true, dateNF: 'yyyy-mm-dd' });
        sheet['!cols'] = fitColumnWidths(rows);
        return sheet;
      };

      XLSX.utils.book_append_sheet(rebuiltWorkbook, toSheet(aoa), '원본');
      XLSX.utils.book_append_sheet(
        rebuiltWorkbook,
        toSheet([['번호', '배정소속', '배정방식', ...keptHeader], ...processedRows]),
        '분류 결과'
      );
      // 중복 시트. 사유 열 + 배포용 열. 헤더와 데이터의 열 개수가 반드시 같아야 한다.
      XLSX.utils.book_append_sheet(
        rebuiltWorkbook,
        toSheet([['중복사유', ...keptHeader], ...duplicateRows]),
        '중복'
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
        .update({ size: rebuiltBuffer.byteLength, file_content: originalContent })
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
        const deptEntries = rowsByCategory[dept.name];
        if (!deptEntries || deptEntries.length === 0) continue; // 배정된 행이 없으면 스킵
        const deptRows = deptEntries.map((e) => e.row);

        const newFileId = uuidv4();
        const timestamp = new Date().toISOString();

        // 해당 부서의 행만으로 새 워크북 생성 (정리된 열만)
        // 실제로 업체에 나가는 파일이다. 여기서 날짜가 ####으로 보이면 바로 문의가 온다.
        const newSheet = toSheet([keptHeader, ...deptRows]);
        const newWorkbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(newWorkbook, newSheet, 'Sheet1');
        const outBuffer: Buffer = XLSX.write(newWorkbook, { type: 'buffer', bookType: 'xlsx' });

        // 파일 내용 인덱싱: 배포 파일의 행들을 객체로 변환
        // DB에는 엑셀 시트와 같은 모양으로 담는다. 시스템이 붙이는 열(번호·배정방식·
        // 배정날짜)까지 넣어야 파일을 열지 않고도 그대로 볼 수 있고 검색에도 걸린다.
        // 배정방식만은 엑셀 파일에 넣지 않는다 — 관리자가 받을 때만 열로 붙인다.
        const assignedAtText = formatAssignedAt(deployedAt);
        const fileContentRows = deptEntries.map(({ row, assignedBy }, idx) => {
          const obj: any = { [ROW_NO_COLUMN]: idx + 1 };
          keptHeader.forEach((header, i) => {
            // Date를 그대로 넣으면 UTC ISO로 저장돼 하루 어긋난다.
            obj[header] = formatCellValue(row[i] ?? '');
          });
          obj[ASSIGNED_BY_COLUMN] = assignedBy;
          // 배포본의 uploaded_at은 '원본을 올린 시각'이라 배정 시각과 다를 수 있다.
          // 배정날짜는 배포한 때이므로 여기서 직접 적어 둔다.
          obj[ASSIGNED_AT_COLUMN] = assignedAtText;
          return obj;
        });

        // 파일명: 원본명_부서명
        const baseFileName = originalFile.name.replace(/\.[^/.]+$/, '');
        const newFileName = `${baseFileName}_${dept.name}.xlsx`;

        // 보험사는 파일 단위로 이미 정했다. 부서별로 다시 판정하면
        // 그 부서에 상품명이 한 종류만 있을 때와 섞였을 때 결과가 갈린다.
        const insurerPath = insurerType;
        const newStoragePath = `dept/${insurerPath}/${dept.id}/${timestamp.slice(0, 10)}/${newFileId}.xlsx`;

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
          insurer_type: insurerType,
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
          await cleanupUploads();
          return NextResponse.json(
            { error: `Failed to deploy file to department ${record.department_id}` },
            { status: 500 }
          );
        }

        uploadedPaths.push(record.storage_path);
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
      // 기록이 없으면 추적할 수 없는 파일이 된다. 올린 것을 전부 되돌린다.
      await cleanupUploads();
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
