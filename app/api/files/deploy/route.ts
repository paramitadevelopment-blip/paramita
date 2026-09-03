import { NextRequest, NextResponse } from 'next/server';
import { canClassifyAndDeploy } from '@/lib/roles';
import { getUserFromRequest } from '@/lib/jwt';
import { verifyCsrfToken } from '@/lib/csrf';
import { createClient } from '@supabase/supabase-js';
import {
  assignRow,
  type DepartmentIndex,
  isExcludedColumn,
  dedupeByOrderNumber,
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
  DUP_ORDER_SHEET,
  DUP_ORDER_REASON,
  DUP_CUSTOMER_SHEET,
  DUP_CUSTOMER_REASON,
  DUP_CROSS_PHONE_SHEET,
  DUP_CROSS_PHONE_REASON,
  INSURER_KIND_COLUMN,
  formatInsurerKind,
  formatAssignedAt,
  HISTORY_DUP_DAYS,
  BLACKLIST_DAYS,
  BLACKLIST_SHEET,
  BLACKLIST_REASON_LISTED,
  BLACKLIST_REASON_NEW,
  normalizeBirth,
} from '@/lib/insurance';
import { formatCellValue, fitColumnWidths, isBlankRow } from '@/lib/excelCell';
import { parseDateCell } from '@/lib/parseDateCell';
import { normalizeSheet } from '@/lib/columnAliases';
import { dedupeAgainstHistory } from '@/lib/historyDedupe';
import { resolveAddresses } from '@/lib/addressFix';
import {
  loadRecentKeys,
  withinDays,
  toDedupeKeys,
  toBlacklistKeys,
  toBlacklistSources,
} from '@/lib/historyLookup';
import {
  splitAlreadyListed,
  splitOverThreshold,
  findListed,
  findPastApplications,
} from '@/lib/blacklist';
import {
  loadBlacklist,
  registerBlacklist,
  recordApplications,
  type BlacklistEntry,
} from '@/lib/blacklistStore';
import { recordReapplyNotices, type ReapplyCandidate } from '@/lib/reapplyStore';
import { loadAssignmentRules } from '@/lib/assignmentRulesStore';
import { isAssignableDepartmentGroup } from '@/lib/departments';
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

    // 분류·배포는 관리자(admin, subadmin)만 한다. DB담당자는 원본만 넘긴다 — 파일전달 화면 참고.
    if (!canClassifyAndDeploy(user.role)) {
      return NextResponse.json({ error: 'Only admin can deploy files' }, { status: 403 });
    }

    // CSRF 토큰 검증
    if (!verifyCsrfToken(request)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const body = await request.json();
    const { files, classificationResults, rowAssignments, memoRule, rulesUpdatedAt } = body;

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
      .select('id, name, group_name')
      .eq('is_admin', false);

    if (deptError || !departments || departments.length === 0) {
      console.error('Failed to fetch departments:', deptError);
      return NextResponse.json({ error: 'Failed to fetch departments' }, { status: 500 });
    }

    // 조직 → 배정 분류들. 분류(classify)와 같은 기준으로 만들어야 후보가 어긋나지 않는다.
    const deptIndex: DepartmentIndex = {};
    for (const dept of departments) {
      if (!isAssignableDepartmentGroup(dept.group_name, false)) continue;
      (deptIndex[dept.group_name] ??= []).push(dept.name);
    }

    /*
     * 사람이 고를 수 있는 배정 소속 이름 전부.
     *
     * 규칙이 정한 건을 화면에서 다른 소속으로 바꿨을 때 그 값이 실재하는지 본다.
     * 배포는 소속명으로 파일을 만들기 때문에, 없는 이름이 들어오면 그 건은
     * 아무 파일에도 안 담기고 조용히 사라진다.
     */
    const assignableDeptNames = new Set(Object.values(deptIndex).flat());

    let assignment: Awaited<ReturnType<typeof loadAssignmentRules>>;
    try {
      assignment = await loadAssignmentRules(supabase);
    } catch (rulesError) {
      console.error('Failed to load assignment rules:', rulesError);
      return NextResponse.json(
        { error: '배정 규칙을 읽지 못해 배포할 수 없습니다. 잠시 후 다시 시도해주세요.' },
        { status: 500 }
      );
    }

    /*
     * 분류할 때 본 규칙과 지금 규칙이 같은가.
     *
     * 분류해 놓고 확인하는 사이에 누가 지역 설정을 바꾸면, 화면에서 본 배정과
     * 실제로 나가는 배정이 달라진다. 사람이 고른 선택도 그때 후보 기준이라
     * 지금은 허용되지 않는 소속일 수 있다. 조용히 다르게 내보내느니 막고
     * 다시 분류하게 한다.
     */
    if (rulesUpdatedAt !== undefined && rulesUpdatedAt !== assignment.updatedAt) {
      return NextResponse.json(
        {
          error: '배정 규칙이 바뀌었습니다. 분류를 다시 실행해주세요.',
          code: 'RULES_CHANGED',
        },
        { status: 409 }
      );
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

    // 지난 30일치 과거 기록. 파일마다 다시 읽으면 같은 것을 여러 번 퍼 올리므로
    // 루프 밖에서 한 번만 읽는다. 이번에 올린 파일들은 뺀다 — 자기 자신과
    // 비교하면 모든 행이 중복이 된다.
    let recentKeys: Awaited<ReturnType<typeof loadRecentKeys>>;
    let blacklistKeys: Awaited<ReturnType<typeof loadBlacklist>>;
    try {
      recentKeys = await loadRecentKeys(supabase, deployedAt, files);
      blacklistKeys = await loadBlacklist(supabase);
    } catch (historyError) {
      console.error('Failed to load recent records:', historyError);
      return NextResponse.json(
        { error: '최근 기록이나 블랙리스트를 읽지 못해 걸러낼 수 없습니다. 잠시 후 다시 시도해주세요.' },
        { status: 500 }
      );
    }

    // 병렬: 모든 파일 정보 조회
    const fileDataResults = await Promise.all(
      files.map((fileId) =>
        supabase
          .from('files')
          // file_content는 엑셀 전체 사본이라 파일당 수백 kB다. 여기서는 안 쓰므로 빼야
          // 파일을 여러 개 배포할 때 쓰지도 않을 데이터가 통째로 메모리에 올라오지 않는다.
          .select('id, name, storage_path, uploaded_by, uploaded_by_name, uploaded_at')
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
    // 배포할 게 하나도 안 나왔을 때 왜인지 알려주려고 모아 둔다.
    // 'No files to deploy'만 보면 원인이 중복인지 오류인지 알 수 없다.
    // 이번 배포에서 새로 명단에 올릴 사람들. 배포가 다 끝난 뒤에 한 번에 넣는다 —
    // 중간에 실패하면 배정도 안 됐는데 명단만 남는다.
    const pendingBlacklist: BlacklistEntry[] = [];
    // 이미 명단에 있는 사람이 또 신청한 건. 명단 줄은 그대로 두고 신청만 덧붙인다.
    const pendingApplications: Array<{ blacklistId: number; entry: BlacklistEntry }> = [];
    // 배정에서 빠진 건을 직전에 받았던 지사에게 알린다. 배포가 끝난 뒤 한 번에 넣는다.
    const pendingReapply: ReapplyCandidate[] = [];

    let totalRowsSeen = 0;
    let totalDupRemoved = 0;

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

      const rawHeaderRow = validColIndices.map((i) => allHeaders[i]);
      const rawDataRows = allRows
        .map((row) => validColIndices.map((i) => row?.[i] ?? ''))
        .filter((row) => !isBlankRow(row));

      // 거래처 양식이 두 가지다. 신규 양식이면 여기서 기존 컬럼 이름으로 바꿔놓아
      // 아래 로직이 양식을 몰라도 되게 한다. 기존 양식이면 그대로 지나간다.
      // classify도 같은 함수를 같은 자리에서 부른다 — 다르면 미리보기와 실제가 갈린다.
      const {
        headers: headerRow,
        rows: dataRows,
        converted: isNewFormatFile,
      } = normalizeSheet(rawHeaderRow, rawDataRows, deployedAt);

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
      // Tel1은 필수 컬럼이 아니다(중복 판정 기준은 Tel2). 없으면 -1이고,
      // 그때는 번호가 하나뿐인 것으로 보아 '번호가 같은' 갈래를 탄다.
      const tel1Idx = headerRow.indexOf('Tel1');
      // 우편번호는 필수 컬럼이 아니다. 없으면 -1이고, 그때는 주소 오타를 못 고친다.
      const zipIdx = headerRow.indexOf('우편번호');
      // 상담메모는 없는 파일도 있다. 없으면 -1.
      const memoIdx = cols.memoCol ? headerRow.indexOf(cols.memoCol) : -1;
      // 접수일자는 필수 컬럼이 아니다. 없으면 -1이고, 그때는 배포 시각으로 물러선다.
      const receiptIdx = headerRow.indexOf('접수일자');
      // 규칙이 꺼졌거나 상담메모 열이 없으면 undefined — assignRow가 규칙을 건너뛴다.
      // 엑셀 날짜 칸은 Date로 들어오므로 formatCellValue를 거친다. 그대로 넘기면
      // 1899년 타임존 오차로 하루 밀린다.
      const memoRuleFor = (row: any[]) =>
        memoRuleOn && memoIdx >= 0
          ? { memo: formatCellValue(row[memoIdx] ?? ''), now: deployedAt }
          : undefined;
      // 이 행이 어느 사람인지. 블랙리스트 판정 두 곳이 같은 값을 봐야 한다.
      const toBlKey = (row: any[]) => ({
        product: String(row[productIdx] ?? ''),
        birth: normalizeBirth(String(row[juminIdx] ?? '')),
        tel1: tel1Idx >= 0 ? String(row[tel1Idx] ?? '') : '',
        tel2: String(row[phoneIdx] ?? ''),
      });

      // 1) 주문번호 중복을 먼저 정리한다. 같은 주문번호는 엑셀에 같은 줄이 두 번
      //    들어간 것이지 두 번 신청한 게 아니다. 이걸 안 빼면 신청 횟수가 부풀려져
      //    멀쩡한 사람이 영구 차단된다.
      const { items: dedupedByOrder, removed: removedByOrder } = dedupeByOrderNumber(
        dataRows,
        (row) => row[orderIdx]
      );

      // 2) 이미 명단에 오른 사람. 30일 중복보다 먼저 봐야 사유가 정확히 남는다.
      const { items: notListedRows, registered: blacklistListed } = splitAlreadyListed(
        dedupedByOrder,
        toBlKey,
        blacklistKeys
      );

      // 3) 60일 안에 3회 이상 신청했는지. 원천 내역을 기준으로 센다 —
      //    30일 중복으로 빠질 건도 신청은 있었던 일이라 여기서 먼저 센다.
      //    중복을 걷어낸 뒤에 세면 2번째부터 30일 중복이 다 걷어가 3회에 도달하지 못한다.
      const { items: notBlacklisted, newlyHit: blacklistNew } = splitOverThreshold(
        notListedRows,
        toBlKey,
        toBlacklistKeys(withinDays(recentKeys, deployedAt, BLACKLIST_DAYS))
      );
      // 지난 30일에 이미 들어온 사람인지 대조한다. 파일 안이 아니라 과거와 비교하므로
      // 여기서만 DB를 읽는다. 두 갈래로 나뉘어 시트도 둘로 갈린다.
      // 4) 지난 30일 대조
      const { items: assignableRows, removedSamePhone, removedCrossPhone } =
        dedupeAgainstHistory(
          notBlacklisted,
          (row) => ({
            name: String(row[nameIdx] ?? ''),
            tel1: tel1Idx >= 0 ? String(row[tel1Idx] ?? '') : '',
            tel2: String(row[phoneIdx] ?? ''),
            birth: String(row[juminIdx] ?? ''),
          }),
          toDedupeKeys(withinDays(recentKeys, deployedAt, HISTORY_DUP_DAYS))
        );

      // 보험사 판정 — 배정 규칙이 갈리므로 분류보다 먼저 정해야 한다.
      // 열을 거르기 전 원본 행에서 보므로 productIdx를 그대로 쓴다.
      // 보험사는 과거 중복을 걷어내기 "전"의 행으로 판정한다.
      // 걷어낸 뒤 행이 하나도 안 남으면 판정할 근거가 사라져,
      // 정작 문제는 "전부 중복"인데 "보험사를 못 가리겠다"는 엉뚱한 오류가 나간다.
      const insurerType = getInsurerTypeFromRows(dedupedByOrder, productIdx);

      if (!insurerType) {
        return NextResponse.json(
          {
            error: `${originalFile.name}: 상품명에서 보험사(동양/흥국)를 가릴 수 없습니다. 한 파일에 두 보험사가 섞여 있는지 확인해주세요.`,
          },
          { status: 400 }
        );
      }

      // 보험사구분을 열로 붙인다. 여기 한 번만 끼우면 아래가 전부 따라온다 —
      // 업체가 받는 배포 파일, 중복 시트, 원본·배포본의 DB 내용, 통합 검색.
      // 각 행 배열은 dedupedRows·removedBy*와 같은 참조라 여기서 넣으면 다 반영된다.
      // 맨 뒤에 붙이므로 위에서 구한 열 위치(orderIdx 등)는 그대로 유효하다.
      const insurerKind = formatInsurerKind(insurerType, isNewFormatFile);
      headerRow.push(INSURER_KIND_COLUMN);
      for (const row of dataRows) row.push(insurerKind);

      // 업체에 넘기지 않을 열을 빼고 남길 열 위치만 추린다.
      const keptIdx = headerRow
        .map((header, idx) => ({ header, idx }))
        .filter(({ header }) => !isExcludedColumn(header))
        .map(({ idx }) => idx);
      const keptHeader = keptIdx.map((idx) => headerRow[idx]);

      // 중복 시트에 넣을 행. 왜 빠졌는지 알아야 사람이 검증할 수 있으므로
      // 사유를 맨 앞 열에 따로 붙인다. 값에 섞으면 그 열을 다시 쓸 수 없다.
      //
      // 규칙이 다르면 시트도 나눈다 — 한데 섞으면 규칙 하나만 검토하려 할 때
      // 사유 열로 일일이 골라내야 한다.
      const toDupRow = (reason: string) => (row: any[]) =>
        [reason, ...keptIdx.map((idx) => row[idx] ?? '')];

      totalRowsSeen += dataRows.length;
      totalDupRemoved +=
        removedByOrder.length + removedSamePhone.length + removedCrossPhone.length;

      const dupOrderRows = removedByOrder.map(toDupRow(DUP_ORDER_REASON));
      const dupSamePhoneRows = removedSamePhone.map(toDupRow(DUP_CUSTOMER_REASON));
      const dupCrossPhoneRows = removedCrossPhone.map(toDupRow(DUP_CROSS_PHONE_REASON));

      // 블랙리스트 시트. 이번에 걸린 것과 예전에 걸려 계속 막히는 것을 사유로 나눈다.
      const blacklistRows = [
        ...blacklistListed.map(toDupRow(BLACKLIST_REASON_LISTED)),
        ...blacklistNew.map(({ item, count }) =>
          toDupRow(`${BLACKLIST_REASON_NEW} (${count}회)`)(item)
        ),
      ];

      // 분류 결과 시트에서 중복 행을 가려내기 위한 집합.
      // dataRows의 각 행은 고유한 배열 객체라 참조로 비교해도 안전하다.
      const duplicateSet = new Set<any[]>([
        ...removedByOrder,
        ...removedSamePhone,
        ...removedCrossPhone,
      ]);

      // 시·도를 못 읽는 주소를 우편번호로 되찾는다. 거래처가 '경냄' 같은 오타를
      // 보내면 전부 '이외지역'으로 빠지는데, 우편번호는 대개 멀쩡하다.
      // 원본 주소는 그대로 두고 판정에 쓸 값만 따로 만든다 — 파일에는 사람이 올린
      // 값이 남아야 대조할 수 있다.
      const addressForAssign = await resolveAddresses(
        dataRows.map((row) => ({
          address: row[addressIdx],
          zip: zipIdx >= 0 ? row[zipIdx] : '',
        })),
        process.env.ZIPCODE_API_KEY ?? ''
      );
      const addressAt = new Map<any[], unknown>();
      dataRows.forEach((row, i) => addressAt.set(row, addressForAssign[i]));

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
      const unpickedRows: Array<{ region: string; key: string }> = [];
      // 주문번호가 없는 행. 분류 화면에서도 막지만 그건 UX일 뿐이라 여기서 다시 본다.
      const missingOrderRows: number[] = [];

      // 중복과 블랙리스트를 걷어낸 행만 순회한다
      for (let dedupedIndex = 0; dedupedIndex < assignableRows.length; dedupedIndex++) {
        const row = assignableRows[dedupedIndex];
        const keptRow = keptIdx.map((idx) => row[idx] ?? '');

        // 주문번호가 없으면 이 건을 가리킬 방법이 없다. 아래에서 한꺼번에 막는다.
        if (isOrderNumberMissing(row[orderIdx])) {
          missingOrderRows.push(dedupedIndex);
          processedRows.push([seq++, '오류', '', ...keptRow]);
          continue;
        }

        const assigned = assignRow(
          row[juminIdx],
          addressAt.get(row) ?? row[addressIdx],
          assignment.rules,
          deptIndex,
          memoRuleFor(row)
        );

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
          // 후보는 행마다 다르다 — 같은 지역이라도 나이 구간이 다르면 받는 소속이
          // 달라진다. 그래서 지역별 목록이 아니라 이 행의 후보로 확인한다.
          if (choice && assigned.choices.includes(choice)) {
            category = choice;
          } else {
            // 안 골랐거나 그 지역에 없는 부서다. 아래에서 한꺼번에 막는다.
            unpickedRows.push({ region: assigned.region, key });
            category = 'error';
          }
        } else {
          /*
           * 규칙이 정한 건. 화면에서 다른 소속으로 바꿨으면 그 값을 쓴다.
           *
           * 클라이언트 값은 신뢰하지 않는다 — 실재하는 배정 소속인지 여기서
           * 다시 본다. 없는 이름이 들어오면 그 건은 아무 파일에도 안 담기고
           * 조용히 사라지기 때문이다.
           */
          const key = pendingRowKey(row[orderIdx], dedupedIndex);
          const choice = picked[key];
          if (choice && choice !== assigned.dept && assignableDeptNames.has(choice)) {
            category = choice;
            assignedBy = ASSIGNED_BY_PERSON;
          } else {
            category = assigned.dept;
          }
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
        [DUP_ORDER_REASON, removedByOrder],
        [DUP_CUSTOMER_REASON, removedSamePhone],
        [DUP_CROSS_PHONE_REASON, removedCrossPhone],
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

      // 블랙리스트로 빠진 행도 같은 방식으로 담는다. 고객 문의가 오면
      // "여러 번 신청해서 배정에서 빠졌다"고 답할 수 있어야 한다.
      for (const [reason, rows] of [
        [BLACKLIST_REASON_LISTED, blacklistListed],
        [BLACKLIST_REASON_NEW, blacklistNew.map((h) => h.item)],
      ] as const) {
        for (const row of rows) {
          const contentRow: any = {
            [ROW_NO_COLUMN]: '',
            [ASSIGNED_DEPT_COLUMN]: BLACKLIST_SHEET,
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

      // 명단에 남길 한 건. 신청 하나가 한 줄이라 주문번호·접수일자까지 들고 간다.
      const toBlacklistEntry = (item: any[], reason: string, count: number): BlacklistEntry => ({
        product: String(item[productIdx] ?? ''),
        birth: String(item[juminIdx] ?? ''),
        tel1: tel1Idx >= 0 ? String(item[tel1Idx] ?? '') : '',
        tel2: String(item[phoneIdx] ?? ''),
        customerName: String(item[nameIdx] ?? ''),
        reason,
        count,
        sourceFileId: originalFiles[fileIdx].id,
        sourceFileName: originalFile.name,
        orderNo: String(item[orderIdx] ?? ''),
        appliedAt: receiptIdx >= 0 ? parseDateCell(item[receiptIdx]) : null,
      });

      /*
       * 이번에 걸린 사람을 명단에 올린다. 미리보기에서는 하지 않는다 —
       * 올려보기만 하고 배포를 안 했는데 영구 차단되면 안 된다.
       *
       * 오늘 건만 신청 기록으로 남기면 화면에 '60일 내 3회 이상 신청 / 1회'로
       * 떠서 무슨 말인지 알 수 없다. 걸리게 만든 지난 신청도 함께 남긴다.
       */
      const blacklistWindow = toBlacklistSources(withinDays(recentKeys, deployedAt, BLACKLIST_DAYS));

      for (const { item, count } of blacklistNew) {
        const entry = toBlacklistEntry(item, BLACKLIST_REASON_NEW, count);
        pendingBlacklist.push(entry);

        // 지난 신청들. 같은 사람인지는 판정과 같은 기준으로 본다.
        for (const past of findPastApplications(entry, blacklistWindow)) {
          pendingBlacklist.push({
            ...entry,
            customerName: past.name || entry.customerName,
            sourceFileId: past.fileId || null,
            sourceFileName: past.fileName || null,
            orderNo: past.orderNo,
            appliedAt: past.receivedAt,
          });
        }
      }

      /*
       * 이미 명단에 있는 사람이 또 신청했다.
       *
       * 명단에 줄을 새로 만들지는 않는다 — 이미 있으니까. 다만 이번 신청도
       * 있었던 일이라 그 사람 밑에 신청 건으로 붙인다. 안 붙이면 신청횟수가
       * 등록 시점 값에 굳어, 화면의 '3회' 옆에 출처가 네 줄 뜨게 된다.
       */
      for (const item of blacklistListed) {
        const listed = findListed(toBlKey(item), blacklistKeys);
        if (!listed) continue;

        pendingApplications.push({
          blacklistId: listed.id,
          entry: toBlacklistEntry(item, BLACKLIST_REASON_LISTED, 0),
        });
      }

      /*
       * 배정에서 빠진 건을 알림 후보로 모은다.
       *
       * 주문번호 중복(중복1)은 넣지 않는다 — 같은 줄이 두 번 들어온 것이지
       * 다시 신청한 게 아니다. 30일 중복과 블랙리스트만 담는다.
       */
      const toReapply = (reason: string) => (item: any[]): ReapplyCandidate => ({
        customerName: String(item[nameIdx] ?? ''),
        birth: String(item[juminIdx] ?? ''),
        tel1: tel1Idx >= 0 ? String(item[tel1Idx] ?? '') : '',
        tel2: String(item[phoneIdx] ?? ''),
        product: String(item[productIdx] ?? ''),
        reason,
        orderNo: String(item[orderIdx] ?? ''),
        sourceFileId: originalFiles[fileIdx].id,
        sourceFileName: originalFile.name,
        // 고객이 실제로 신청한 날. 우리가 배포한 날이 아니다.
        receivedAt: receiptIdx >= 0 ? parseDateCell(item[receiptIdx]) : null,
      });

      pendingReapply.push(
        ...removedSamePhone.map(toReapply(DUP_CUSTOMER_REASON)),
        ...removedCrossPhone.map(toReapply(DUP_CROSS_PHONE_REASON)),
        ...blacklistListed.map(toReapply(BLACKLIST_REASON_LISTED)),
        ...blacklistNew.map(({ item, count }) =>
          toReapply(`${BLACKLIST_REASON_NEW} (${count}회)`)(item)
        )
      );

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

      // 원본파일을 시트 4장으로 다시 저장한다.
      //   원본     = 업로드한 파일 그대로
      //   분류 결과 = 번호 + 배정소속이 붙은 가공본
      //   중복1    = 주문번호가 같아 빠진 행
      //   중복2    = 30일 내 이름+전화가 같아 빠진 행
      //   중복3    = 30일 내 이름+생년월일+번호가 겹쳐 빠진 행
      //   블랙리스트 = 60일 내 3회 이상 신청해 지사 배정에서 뺀 행
      // 시트 구성이 파일마다 달라지면 받는 쪽에서 "없는 건지 안 만든 건지"
      // 구분이 안 되므로, 빠진 행이 없어도 시트는 항상 만든다.
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
      // 중복 시트 두 장. 사유 열 + 배포용 열. 헤더와 데이터의 열 개수가 반드시 같아야 한다.
      // 빠진 행이 없어도 헤더만 넣어 항상 만든다 — 시트가 없으면 받는 쪽에서
      // "중복이 없는 건지 안 만든 건지" 구분이 안 된다.
      for (const [sheetName, rows] of [
        [DUP_ORDER_SHEET, dupOrderRows],
        [DUP_CUSTOMER_SHEET, dupSamePhoneRows],
        [DUP_CROSS_PHONE_SHEET, dupCrossPhoneRows],
        [BLACKLIST_SHEET, blacklistRows],
      ] as const) {
        XLSX.utils.book_append_sheet(
          rebuiltWorkbook,
          toSheet([[DUPLICATE_REASON_COLUMN, ...keptHeader], ...rows]),
          sheetName
        );
      }

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
          uploaded_by_name: originalFile.uploaded_by_name,
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
      // 중복으로 다 빠진 것과 애초에 배정될 게 없던 것은 원인이 다르다.
      // 같은 문구로 뭉뚱그리면 사람이 무엇을 고쳐야 할지 알 수 없다.
      const message =
        totalDupRemoved > 0 && totalDupRemoved === totalRowsSeen
          ? `배포할 행이 없습니다. ${totalRowsSeen}건이 모두 중복으로 제외되었습니다. (최근 ${HISTORY_DUP_DAYS}일 안에 이미 올라온 건이거나 파일 안에서 겹칩니다)`
          : totalDupRemoved > 0
            ? `배포할 행이 없습니다. ${totalRowsSeen}건 중 ${totalDupRemoved}건이 중복으로 빠졌고, 남은 행은 어느 소속에도 배정되지 않았습니다.`
            : '배포할 행이 없습니다. 배정된 건이 하나도 없습니다.';

      return NextResponse.json({ error: message }, { status: 400 });
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

    // 배포가 다 끝난 뒤에 명단에 올린다. 중간에 실패하면 배정도 안 됐는데
    // 명단만 남아 영구히 막히는 사람이 생긴다.
    // 실패해도 배포는 되돌리지 않는다 — 이번 건은 이미 빠졌고, 다음에 다시 걸린다.
    const blacklistedCount = await registerBlacklist(supabase, pendingBlacklist);

    // 이미 명단에 있던 사람의 이번 신청을 덧붙이고 횟수를 다시 센다.
    // 같은 파일을 두 번 올려도 주문번호가 같아 한 건으로 남는다.
    await recordApplications(supabase, pendingApplications);

    /*
     * 재신청 알림을 쌓는다.
     *
     * 직전에 받았던 지사를 찾을 때는 매칭된 그 행이 아니라, 그 사람의 과거 기록 중
     * 실제로 배정된 가장 최근 건을 본다. 매칭된 행이 자기도 '중복 제외'였으면
     * 알려줄 지사가 없기 때문이다.
     *
     * 파일에는 배정 분류('파라인슈1')로 적히는데 사용자 소속은 조직명('파라인슈')이라
     * 여기서 한 번 바꿔 둔다.
     */
    const { data: deptRows } = await supabase.from('departments').select('name, group_name');
    const groupByDept = new Map<string, string>(
      (deptRows ?? []).map((d: any) => [String(d.name), String(d.group_name)])
    );

    const reapplyResult = await recordReapplyNotices(
      supabase,
      pendingReapply,
      recentKeys,
      (dept) => groupByDept.get(dept) ?? null,
      deployedAt
    );

    return NextResponse.json({
      success: true,
      message: 'Files deployed successfully to all departments',
      deployedCount: fileRecords.length,
      // 걸린 행 수가 아니라 명단에 오른 사람 수다. 한 사람이 3번 걸려도 1명이다.
      blacklistedCount,
    });
  } catch (error) {
    console.error('File deployment error:', error);
    return NextResponse.json({ error: 'Failed to deploy file' }, { status: 500 });
  }
}
