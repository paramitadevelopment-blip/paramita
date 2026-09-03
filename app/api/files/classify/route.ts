import { NextRequest, NextResponse } from 'next/server';
import { canClassifyAndDeploy } from '@/lib/roles';
import { getUserFromRequest } from '@/lib/jwt';
import { verifyCsrfToken } from '@/lib/csrf';
import { createClient } from '@supabase/supabase-js';
import {
  assignRow,
  getInsurerTypeFromRows,
  type DepartmentIndex,
  isExcludedColumn,
  dedupeByOrderNumber,
  findRequiredColumns,
  getMissingColumnLabels,
  pendingRowKey,
  isOrderNumberMissing,
  ORDER_NUMBER_MISSING_REASON,
  INSURER_KIND_COLUMN,
  DUP_ORDER_REASON,
  DUP_CUSTOMER_REASON,
  DUP_CROSS_PHONE_REASON,
  HISTORY_DUP_DAYS,
  BLACKLIST_DAYS,
  BLACKLIST_REASON_LISTED,
  BLACKLIST_REASON_NEW,
  formatInsurerKind,
  normalizeBirth,
} from '@/lib/insurance';
import { formatCellValue, isBlankRow } from '@/lib/excelCell';
import { normalizeRecords } from '@/lib/columnAliases';
import { dedupeAgainstHistory } from '@/lib/historyDedupe';
import { resolveAddresses } from '@/lib/addressFix';
import { loadRecentKeys, withinDays, toDedupeKeys, toBlacklistKeys } from '@/lib/historyLookup';
import { splitAlreadyListed, splitOverThreshold } from '@/lib/blacklist';
import { loadBlacklist } from '@/lib/blacklistStore';
import { loadAssignmentRules } from '@/lib/assignmentRulesStore';
import { REGIONS, detectRegion } from '@/lib/assignmentRegions';
import { isAssignableDepartmentGroup } from '@/lib/departments';
import * as XLSX from 'xlsx';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/** 업로드 라우트와 같은 한도. 여기가 느슨하면 업로드 전에 서버가 먼저 주저앉는다. */
const MAX_FILE_SIZE = 300 * 1024 * 1024;
/** 한 번에 처리할 파일 수. 없으면 수백 개를 한 요청에 밀어넣을 수 있다. */
const MAX_FILES = 30;

function emptyCounts(categories: string[]): Record<string, number> {
  return categories.reduce((acc, c) => ({ ...acc, [c]: 0 }), {});
}

export async function POST(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 분류·배포는 관리자(admin, subadmin)만 한다. DB담당자는 원본만 넘긴다 — 파일전달 화면 참고.
    if (!canClassifyAndDeploy(user.role)) {
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

    // 지난 30일치 과거 기록. 파일마다 다시 읽으면 같은 것을 여러 번 퍼 올린다.
    // 분류 단계에서는 아직 파일이 저장되기 전이라 뺄 것이 없다.
    let recentKeys: Awaited<ReturnType<typeof loadRecentKeys>>;
    let blacklistKeys: Awaited<ReturnType<typeof loadBlacklist>>;
    // 배정 규칙. 어느 소속이 어느 지역·나이대를 받는지는 이제 설정값이다.
    let assignment: Awaited<ReturnType<typeof loadAssignmentRules>>;
    try {
      recentKeys = await loadRecentKeys(supabase, classifiedAt);
      blacklistKeys = await loadBlacklist(supabase);
      assignment = await loadAssignmentRules(supabase);
    } catch (historyError) {
      console.error('Failed to load recent records:', historyError);
      return NextResponse.json(
        { error: '최근 기록이나 배정 규칙을 읽지 못해 분류할 수 없습니다. 잠시 후 다시 시도해주세요.' },
        { status: 500 }
      );
    }

    /*
     * 배정 대상 소속.
     *
     * 예전에는 코드에 목록을 적어 뒀지만, 이제 소속은 화면에서 늘어날 수
     * 있다. 관리자 소속만 빼고 DB에 있는 그대로 쓴다 —
     * 목록이 코드와 DB 두 곳에 있으면 새 소속으로 배정된 건이 조용히 사라진다.
     */
    const { data: departments } = await supabase
      .from('departments')
      .select('id, name, group_name')
      .eq('is_admin', false);

    const deptRows = departments ?? [];
    const CATEGORIES = deptRows.map((d) => d.name);

    const deptMap: Record<string, number> = {};
    for (const dept of deptRows) {
      deptMap[dept.name] = dept.id;
    }

    /*
     * 조직 → 그 조직의 배정 분류들.
     *
     * 나뉜 조직(파라인슈)에서 나이로 하나를 고를 때와, 아무도 안 맡은 건의
     * 후보 목록을 만들 때 쓴다. 후보로 나가면 안 되는 소속('이외지역'·'담당자')은
     * 여기서 빼야 한다 — 규칙 저장 API와 같은 기준을 본다.
     */
    const deptIndex: DepartmentIndex = {};
    for (const dept of deptRows) {
      if (!isAssignableDepartmentGroup(dept.group_name, false)) continue;
      (deptIndex[dept.group_name] ??= []).push(dept.name);
    }

    // 파일별 결과
    const perFile: any[] = [];

    // 전체 합산 (배포 시 전달용)
    const mergedCounts = emptyCounts(CATEGORIES);
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
      // 공백만 남은 유령 행을 여기서 버린다. 미리보기(아래 originalRows)와 deploy는
      // 이미 걸러내고 있어, 여기만 안 걸러내면 화면 건수와 판정 건수가 갈린다.
      const parsed = (XLSX.utils.sheet_to_json(worksheet) as Record<string, any>[]).filter(
        (row) => !isBlankRow(row)
      );

      // '원본 데이터' 미리보기용. 사람이 올린 파일 그대로 — 열 이름을 바꾸기도,
      // 열을 빼기도, 중복을 걷어내기도 전이다.
      //
      // 여기에 변환 결과를 보여주면 관리자가 엑셀을 켜놓고 대조할 수가 없고,
      // 매핑이 틀려도 그럴듯한 값이 찍혀 있어 아무도 못 잡는다. 변환 후 모습은
      // 바로 옆 '분류 결과'가 이미 보여준다.
      const originalAoa = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
      const originalHeaders = (originalAoa[0] ?? []).map((h) => String(h ?? ''));
      const originalRows = originalAoa
        .slice(1)
        .filter((row) => !isBlankRow(row))
        .map((row) => originalHeaders.map((_, i) => formatCellValue(row?.[i] ?? '')));

      // 거래처 양식이 두 가지다. 신규 양식이면 여기서 기존 컬럼 이름으로 바꿔놓아
      // 아래 로직이 양식을 몰라도 되게 한다. 기존 양식이면 그대로 지나간다.
      // deploy도 같은 함수를 같은 자리에서 부른다 — 다르면 미리보기와 실제가 갈린다.
      const { records: rawData, converted: isNewFormatFile } = normalizeRecords(
        parsed,
        classifiedAt
      );

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

      const counts = emptyCounts(CATEGORIES);
      const rowsByCategory: Record<string, Record<string, any>[]> = CATEGORIES.reduce(
        (acc, c) => ({ ...acc, [c]: [] }),
        {}
      );
      const errorRows: Array<{ row: number; reason: string }> = [];

      // 중복 제거를 분류보다 먼저 한다.
      // 원본 행 번호를 함께 들고 다녀야 오류 보고가 실제 파일 위치를 가리킨다.
      const indexedRows = rawData.map((row, i) => ({ row, sourceRow: i + 2 }));

      // 이 행이 어느 사람인지. 블랙리스트 판정 두 곳이 같은 값을 봐야 한다.
      const toBlKey = (entry: { row: Record<string, any> }) => ({
        product: String(entry.row[productCol] ?? ''),
        birth: normalizeBirth(String(entry.row[juminCol] ?? '')),
        tel1: String(entry.row['Tel1'] ?? ''),
        tel2: String(entry.row[phoneCol] ?? ''),
      });

      // 1) 주문번호 중복을 먼저 정리한다. 같은 주문번호는 엑셀에 같은 줄이 두 번
      //    들어간 것이지 두 번 신청한 게 아니다.
      const { items: dedupedByOrder, removed: removedByOrder } = dedupeByOrderNumber(
        indexedRows,
        (entry) => entry.row[orderCol]
      );

      // 2) 이미 명단에 오른 사람. 30일 중복보다 먼저 봐야 사유가 정확히 남는다.
      const { items: notListedRows, registered: blacklistListed } = splitAlreadyListed(
        dedupedByOrder,
        toBlKey,
        blacklistKeys
      );

      // 3) 60일 안에 3회 이상. 원천 내역 기준으로 센다 — 30일 중복으로 빠질 건도
      //    신청은 있었던 일이라 여기서 먼저 센다. deploy와 같은 순서다.
      const { items: notBlacklisted, newlyHit: blacklistNew } = splitOverThreshold(
        notListedRows,
        toBlKey,
        toBlacklistKeys(withinDays(recentKeys, classifiedAt, BLACKLIST_DAYS))
      );

      // 4) 지난 30일 대조 — deploy와 같은 함수, 같은 순서를 쓴다.
      //    다르면 미리보기에서 본 건수와 실제로 나가는 건수가 갈린다.
      const { items: assignableEntries, removedSamePhone, removedCrossPhone } =
        dedupeAgainstHistory(
          notBlacklisted,
          (entry) => ({
            name: String(entry.row[nameCol] ?? ''),
            tel1: String(entry.row['Tel1'] ?? ''),
            tel2: String(entry.row[phoneCol] ?? ''),
            birth: String(entry.row[juminCol] ?? ''),
          }),
          toDedupeKeys(withinDays(recentKeys, classifiedAt, HISTORY_DUP_DAYS))
        );

      const duplicateRows = [
        ...removedByOrder,
        ...removedSamePhone,
        ...removedCrossPhone,
        ...blacklistListed,
        ...blacklistNew.map((h) => h.item),
      ];
      const dupRemovedCount = duplicateRows.length;

      // 보험사 판정 — 배정에는 안 쓰이고 파일 이름표·저장 경로에 쓰인다.
      // 한 파일에 두 보험사가 섞이면 여기서 막는 것이 본래 목적이다.
      // 보험사는 과거 중복을 걷어내기 "전"의 행으로 판정한다.
      // 걷어낸 뒤 행이 하나도 안 남으면 판정할 근거가 사라져,
      // 정작 문제는 "전부 중복"인데 "보험사를 못 가리겠다"는 엉뚱한 오류가 나간다.
      const insurerType = getInsurerTypeFromRows(
        dedupedByOrder.map(({ row }) => [String(row[productCol] ?? '')]),
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

      // 시·도를 못 읽는 주소를 우편번호로 되찾는다. 거래처가 '경냄' 같은 오타를
      // 보내면 전부 '이외지역'으로 빠지는데, 우편번호는 대개 멀쩡하다.
      // 원본 주소는 그대로 두고 판정에 쓸 값만 따로 만든다 — 미리보기에는 사람이
      // 올린 값이 남아야 대조할 수 있다.
      // deploy도 같은 함수를 쓴다. 다르면 미리보기와 실제 배정이 갈린다.
      const addressForAssign = await resolveAddresses(
        rawData.map((row) => ({ address: row[addressCol], zip: row['우편번호'] })),
        process.env.ZIPCODE_API_KEY ?? ''
      );
      const addressAt = new Map<Record<string, any>, unknown>();
      rawData.forEach((row, i) => addressAt.set(row, addressForAssign[i]));

      // 보험사구분을 행에 붙인다. deploy와 같은 자리에서 같은 값을 넣어야
      // 미리보기에서 본 것과 실제로 나가는 파일이 같다.
      // 아래 previewHeaders가 행의 키에서 만들어지므로 여기서 넣으면
      // 원본데이터·분류결과·중복 미리보기에 모두 따라온다.
      const insurerKind = formatInsurerKind(insurerType, isNewFormatFile);
      for (const row of rawData) row[INSURER_KIND_COLUMN] = insurerKind;

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
      // 갈 수 있는 소속은 행마다 다르다 — 같은 지역이라도 나이 구간이 다르면
      // 받는 소속이 달라진다. 그래서 지역이 아니라 행에 붙여 보낸다.
      const pendingChoicesByRegion: Record<string, string[][]> = {};
      // 왜 직접 골라야 하는지. 'multiple'은 여러 소속이 겹친 것, 'unmatched'는
      // 아무도 안 맡은 것이다. 둘은 사람이 할 판단이 달라서 화면에 구분해 보여준다.
      const pendingReasonsByRegion: Record<string, string[]> = {};
      /*
       * 규칙이 이미 정한 건들. 화면이 수동배정 표에 함께 보여주고,
       * 필요하면 그 자리에서 다른 소속으로 바꿀 수 있게 한다.
       *
       * 지역별로 나누지 않는다 — 주소를 못 읽은 건은 지역이 없어서
       * 지역별 배열에 넣을 자리가 없다.
       */
      const assignedRows: Array<{
        key: string;
        region: string | null;
        dept: string;
        row: Record<string, any>;
      }> = [];
      for (const region of REGIONS) {
        pendingByRegion[region] = 0;
        pendingRowsByRegion[region] = [];
        pendingKeysByRegion[region] = [];
        pendingJuminByRegion[region] = [];
        pendingChoicesByRegion[region] = [];
        pendingReasonsByRegion[region] = [];
      }

      for (let dedupedIndex = 0; dedupedIndex < assignableEntries.length; dedupedIndex++) {
        const { row, sourceRow } = assignableEntries[dedupedIndex];
        try {
          // 주문번호가 없으면 배정 전에 막는다. 이 건을 가리킬 방법이 없어
          // 내보낸 뒤에는 어느 행이었는지 되짚을 수 없다.
          if (isOrderNumberMissing(row[orderCol])) {
            errorRows.push({ row: sourceRow, reason: ORDER_NUMBER_MISSING_REASON });
            continue;
          }

          const assigned = assignRow(
            row[juminCol],
            addressAt.get(row) ?? row[addressCol],
            assignment.rules,
            deptIndex,
            memoRuleFor(row)
          );

          if (assigned.kind === 'error') {
            errorRows.push({ row: sourceRow, reason: assigned.reason });
          } else if (assigned.kind === 'select') {
            pendingByRegion[assigned.region]++;
            pendingRowsByRegion[assigned.region].push(row);
            pendingKeysByRegion[assigned.region].push(pendingRowKey(row[orderCol], dedupedIndex));
            pendingJuminByRegion[assigned.region].push(String(row[juminCol] ?? ''));
            pendingChoicesByRegion[assigned.region].push(assigned.choices);
            pendingReasonsByRegion[assigned.region].push(assigned.reason);
          } else if (counts.hasOwnProperty(assigned.dept)) {
            counts[assigned.dept]++;
            rowsByCategory[assigned.dept].push(row);
            assignedRows.push({
              key: pendingRowKey(row[orderCol], dedupedIndex),
              // 주소를 못 읽은 건은 지역이 없다. 화면에서 '-'로 보여준다.
              region: detectRegion(addressAt.get(row) ?? row[addressCol]),
              dept: assigned.dept,
              row,
            });
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
        ...removedByOrder.map((entry) => [entry.sourceRow, DUP_ORDER_REASON] as const),
        ...removedSamePhone.map((entry) => [entry.sourceRow, DUP_CUSTOMER_REASON] as const),
        ...removedCrossPhone.map(
          (entry) => [entry.sourceRow, DUP_CROSS_PHONE_REASON] as const
        ),
        ...blacklistListed.map((entry) => [entry.sourceRow, BLACKLIST_REASON_LISTED] as const),
        ...blacklistNew.map(
          ({ item, count }) => [item.sourceRow, `${BLACKLIST_REASON_NEW} (${count}회)`] as const
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

        const assigned = assignRow(
          row[juminCol],
          addressAt.get(row) ?? row[addressCol],
          assignment.rules,
          deptIndex,
          memoRuleFor(row)
        );
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
      for (const region of REGIONS) {
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
        pendingChoicesByRegion,
        pendingReasonsByRegion,
        // 규칙이 정한 건을 바꿀 때 고를 수 있는 소속 전부.
        // 그 행의 후보가 아니라 전체다 — 규칙 밖으로 옮기는 일이기 때문이다.
        assignableDepts: Object.values(deptIndex).flat(),
        assignedRows: assignedRows.map((entry) => ({
          key: entry.key,
          region: entry.region,
          dept: entry.dept,
          row: previewHeaders.map((header) => formatCellValue(entry.row[header] ?? '')),
        })),
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
        // 올린 파일 그대로 — 변환 전, 열 거르기 전, 중복 걷어내기 전
        originalHeaders,
        originalRows,
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
      /*
       * 이 결과가 어느 시점의 규칙으로 나온 것인지.
       *
       * 분류해 놓고 확인하는 사이에 누가 설정을 바꾸면 화면에 보인 배정과 실제로
       * 나가는 배정이 갈린다. 배포가 이 값을 받아 대조해서, 달라졌으면 막는다.
       */
      rulesUpdatedAt: assignment.updatedAt,
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
