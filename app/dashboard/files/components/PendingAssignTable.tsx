'use client';

import { memo, useState } from 'react';
import { MdArrowDropUp, MdArrowDropDown } from 'react-icons/md';
import { REGIONS, type Region } from '@/lib/assignmentRegions';
import {
  commonChoicesInScope,
  rowsInScope,
  scopeKey,
  summarizePendingReasons,
  type PendingReason,
  type PickScope,
} from '@/lib/pendingPicks';
import type { ClassifiedFile } from '@/app/hooks/useAutoClassify';
import styles from '../page.module.css';

interface PendingAssignTableProps {
  current: ClassifiedFile;
  currentIndex: number;
  /** 지역 탭 → 선택 방식. 탭마다 따로 기억한다 */
  pickMode: Record<string, 'manual' | 'auto'>;
  onPickMode: (fileIdx: number, mode: 'manual' | 'auto', scope: PickScope) => void;
  pendingSort: { by: 'region' | number; order: 'asc' | 'desc' };
  onToggleSort: (by: 'region' | number) => void;
  /** 주문번호 → 소속명 */
  rowPicks: Record<string, string>;
  onPickRow: (key: string, dept: string) => void;
  /** 보고 있는 지역 탭. 'all'이면 전부 한 표에 */
  regionTab: Region | 'all';
  onRegionTab: (fileIdx: number, region: Region | 'all') => void;
  /** 보고 있는 사유 필터. 'all'이면 사유로 안 거른다 */
  reasonTab: PendingReason | 'all';
  onReasonTab: (fileIdx: number, reason: PendingReason | 'all') => void;
  /** 보고 있는 범위를 한 소속으로 몰아준다 */
  onPickAll: (fileIdx: number, scope: PickScope, dept: string) => void;
}

/** 사유 필터 버튼에 쓸 이름 */
const REASON_LABEL: Record<PendingReason, string> = {
  assigned: '자동분류',
  multiple: '지사 중복',
  unmatched: '담당 지사 없음',
};

/**
 * 사람이 소속을 골라야 하는 건들의 표.
 * 직접선택·자동선택 탭, 열 정렬, 소속 드롭다운을 담는다.
 */
const PendingAssignTable = memo(function PendingAssignTableComponent({
  current,
  currentIndex,
  pickMode,
  onPickMode,
  pendingSort,
  onToggleSort,
  rowPicks,
  onPickRow,
  regionTab,
  onRegionTab,
  reasonTab,
  onReasonTab,
  onPickAll,
}: PendingAssignTableProps) {
  /** 일괄배정으로 고른 소속. 누르기 전까지는 비어 있다 */
  const [bulkDept, setBulkDept] = useState('');
  // 건이 실제로 있는 지역만. 지역은 18개지만 한 파일에 다 나오는 일은 없다.
  const activeRegions = REGIONS.filter((region) => (current.pendingByRegion?.[region] ?? 0) > 0);

  // 고를 것이 없으면 이 영역 자체를 그리지 않는다.
  if (activeRegions.length === 0) return null;

  // 지역이 하나뿐이면 탭을 그려봐야 고를 게 없다. 그때는 표에 다 보여준다.
  const showRegionTabs = activeRegions.length > 1;
  const shownRegion = showRegionTabs ? regionTab : 'all';

  /*
   * 사유 필터는 지역 안에 어떤 사유가 실제로 있을 때만 보여준다.
   * 한 가지뿐이면 눌러 봐야 걸러지는 게 없어 자리만 차지한다.
   */
  const reasonsInRegion = summarizePendingReasons(current, { region: shownRegion, reason: 'all' })
    .map((g) => g.reason)
    .filter((r, i, arr) => arr.indexOf(r) === i);
  const showReasonTabs = reasonsInRegion.length > 1;
  const shownReason = showReasonTabs ? reasonTab : 'all';

  const scope: PickScope = { region: shownRegion, reason: shownReason };

  /*
   * 안내 카드는 '사람이 골라야 하는 건'만 설명한다.
   * 규칙대로 간 건까지 세면 "왜 직접 골라야 하나"라는 물음에 답이 안 된다.
   */
  const reasonGroups = summarizePendingReasons(current, scope).filter(
    (group) => group.reason !== 'assigned'
  );

  // 이 범위 전부가 갈 수 있는 소속. 일부만 갈 수 있는 곳은 일괄배정에 안 내놓는다.
  const bulkChoices = commonChoicesInScope(current, scope);
  const scopedRows = rowsInScope(current, scope);
  const scopedCount = scopedRows.length;
  /*
   * 자동 배분이 실제로 채울 수 있는 건수.
   *
   * 규칙이 정한 건은 자동 배분 대상이 아니다. 그런 건만 보고 있을 때
   * 버튼을 열어 두면, 눌러도 아무 일이 안 일어나는데 눌린 것처럼 보여
   * "채워졌겠거니" 하고 넘어가게 된다.
   */
  const autoTargetCount = scopedRows.filter((row) => row.reason !== 'assigned').length;

  return (
  <div
    style={{
      marginBottom: '16px',
      padding: '24px 14px',
      border: '1px solid #ddd',
      borderRadius: '8px',
      background: 'white',
    }}
  >
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontWeight: 700, marginBottom: '8px', fontSize: '26px' }}>
          배정할 소속을 선택해주세요
        </div>
        <div style={{ fontSize: '20px', color: '#666', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <span style={{ color: '#db1a62', fontWeight: 700 }}>
            총 {Object.values(current.pendingByRegion ?? {}).reduce((a, b) => a + b, 0)}건
          </span>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {/* 건수가 있는 지역만. 지역이 18개라 0건까지 늘어놓으면 읽을 수가 없다. */}
            {activeRegions.map((region) => (
              <span key={region}>
                {region} : {current.pendingByRegion?.[region] ?? 0}건
              </span>
            ))}
          </div>
        </div>
      </div>

    {/*
      선택 방식. 자동은 같은 표에 값만 미리 채워 넣는다 — 채운 뒤에도 고칠 수 있다.
      지금 보고 있는 지역 탭에만 걸린다. 다른 탭에서 고른 것은 건드리지 않는다.
    */}
    <div className={styles.pickModeTabs}>
      {([
        { mode: 'manual' as const, label: '직접선택' },
        { mode: 'auto' as const, label: '자동선택' },
      ]).map(({ mode, label }) => {
        const active = (pickMode[scopeKey(scope)] ?? 'manual') === mode;
        // 자동 배분할 건이 없으면 막는다 (규칙이 정한 건만 보고 있을 때).
        const blocked = mode === 'auto' && autoTargetCount === 0;
        return (
          <button
            key={mode}
            type="button"
            className={`${styles.pickModeTab} ${active ? styles.pickModeTabActive : ''}`}
            onClick={() => onPickMode(currentIndex, mode, scope)}
            disabled={blocked}
            title={blocked ? '규칙이 정한 건은 자동 배분 대상이 아닙니다.' : undefined}
          >
            {label}
          </button>
        );
      })}
      {autoTargetCount === 0 && (
        <span className={styles.pickModeNote}>
          규칙이 정한 건이라 자동선택 대상이 아닙니다. 아래에서 직접 바꿀 수 있습니다.
        </span>
      )}
    </div>

    {/*
      지역 탭. 지역이 여럿 걸렸을 때만 나온다.
      탭은 보이는 행만 거를 뿐이고, 안 고른 건이 남았는지 보는 배포 게이트는
      전체를 본다 — 탭에 가려진 건이 조용히 빠지면 안 된다.
    */}
    {showRegionTabs && (
      <div className={styles.pickModeTabs} style={{ flexWrap: 'wrap' }}>
        {(['all', ...activeRegions] as Array<Region | 'all'>).map((region) => {
          const active = shownRegion === region;
          const count =
            region === 'all'
              ? activeRegions.reduce((sum, r) => sum + (current.pendingByRegion?.[r] ?? 0), 0)
              : current.pendingByRegion?.[region] ?? 0;
          return (
            <button
              key={region}
              type="button"
              className={`${styles.pickModeTab} ${active ? styles.pickModeTabActive : ''}`}
              onClick={() => onRegionTab(currentIndex, region)}
            >
              {/* '충북 1'은 1번인지 1건인지 헷갈린다. 단위를 붙여 둔다. */}
              {region === 'all' ? '전체' : region} {count}건
            </button>
          );
        })}
      </div>
    )}

    {/*
      사유 필터. 지사가 겹친 건과 담당 지사가 없는 건은 손이 다르다 —
      겹친 건은 나눠 담고, 없는 건은 한 곳으로 몰아주는 일이 많다.
      섞어 두면 한 건씩 눌러 골라내야 한다.
    */}
    {showReasonTabs && (
      <div className={styles.pickModeTabs} style={{ flexWrap: 'wrap' }}>
        {(['all', ...reasonsInRegion] as Array<PendingReason | 'all'>).map((reason) => {
          const active = shownReason === reason;
          const count = rowsInScope(current, { region: shownRegion, reason }).length;
          return (
            <button
              key={reason}
              type="button"
              className={`${styles.pickModeTab} ${active ? styles.pickModeTabActive : ''}`}
              onClick={() => onReasonTab(currentIndex, reason)}
            >
              {reason === 'all' ? '전체' : REASON_LABEL[reason]} {count}건
            </button>
          );
        })}
      </div>
    )}

    {/*
      일괄배정. 지금 보고 있는 건들을 한 소속으로 몰아준다.
      전부가 갈 수 있는 곳만 목록에 올린다 — 일부만 갈 수 있는 곳을 내놓으면
      눌러 놓고도 몇 건이 왜 안 채워졌는지 알 수 없다.
    */}
    {bulkChoices.length > 0 && (
      <div className={styles.bulkAssignBar}>
        <span className={styles.bulkAssignLabel}>지금 보이는 {scopedCount}건을</span>
        {/* 표 안의 소속 드롭다운과 같은 모양. 기본 화살표를 지우고 아이콘을 얹는다 */}
        <div className={styles.bulkAssignSelectWrap}>
          <select
            className={styles.bulkAssignSelect}
            value={bulkDept}
            onChange={(e) => setBulkDept(e.target.value)}
          >
            <option value="">소속 선택</option>
            {bulkChoices.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
          <MdArrowDropDown className={styles.pendingSelectCaret} />
        </div>
        <button
          type="button"
          className={styles.bulkAssignBtn}
          disabled={!bulkDept}
          onClick={() => onPickAll(currentIndex, scope, bulkDept)}
        >
          한 번에 배정
        </button>
      </div>
    )}

    {/*
      어느 지역에서 왜 넘어왔는지 한 줄씩. 지역을 앞에 둔다 —
      전체 탭에서는 여러 지역이 섞여 나오는데 사유만 늘어놓으면
      무엇을 손봐야 할지 알 수가 없다.
    */}
    {reasonGroups.length > 0 && (
      <div className={styles.pendingReasonBox}>
        {reasonGroups.map((group) => {
          // 담당 지사가 없는 건은 지역 설정에 빈칸이 있다는 뜻이라 눈에 띄게 둔다.
          const isGap = group.reason === 'unmatched';
          return (
            <div
              key={`${group.region ?? '-'}-${group.reason}-${group.choices.join(',')}`}
              className={`${styles.pendingReasonCard} ${isGap ? styles.pendingReasonCardGap : ''}`}
            >
              <div className={styles.pendingReasonHead}>
                <span className={styles.pendingReasonWhere}>{group.region ?? '지역 미상'}</span>
                <span className={styles.pendingReasonCount}>{group.count}건</span>
              </div>
              <div className={styles.pendingReasonWhat}>
                {isGap ? '담당 지사 없음' : `${group.choices.join(' · ')} 겹침`}
              </div>
            </div>
          );
        })}
      </div>
    )}

    {/*
      값을 자르지 않고 다 보여준다. 표는 내용만큼 가로로 길어지고 이 칸이 스크롤한다.
      대신 '배정 소속'은 오른쪽에 붙여 둬(sticky) 아무리 밀어도 따라온다.
    */}
    <div className={styles.pendingTableWrap}>
      <table className={styles.pendingTable}>
        <thead>
          <tr className={styles.pendingHeadRow}>
            <th
              className={styles.pendingSortableTh}
              onClick={() => onToggleSort('region')}
            >
              <span className={styles.pendingThInner}>
                지역
                {pendingSort.by === 'region' &&
                  (pendingSort.order === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />)}
              </span>
            </th>
            {current.previewHeaders?.map((header, colIdx) => (
              <th
                key={header}
                className={styles.pendingSortableTh}
                onClick={() => onToggleSort(colIdx)}
              >
                <span className={styles.pendingThInner}>
                  {header}
                  {pendingSort.by === colIdx &&
                    (pendingSort.order === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />)}
                </span>
              </th>
            ))}
            <th className={styles.pendingDeptTh}>배정 소속</th>
          </tr>
        </thead>
        <tbody>
          {(() => {
            // 행을 가리키는 건 화면 순서가 아니라 주문번호다.
            // 배포는 파일 행 순서로 도는데 여긴 지역별로 묶어 보여주므로,
            // 위치 번호로 주고받으면 선택이 다른 사람에게 붙는다.
            // 지역 탭과 사유 필터를 모두 통과한 건만 그린다.
            // 키는 서버가 만들어 보낸 것을 그대로 쓴다 — 여기서 다시 만들면
            // 배포가 쓰는 키와 규칙이 갈려 선택이 엉뚱한 행에 붙는다.
            // 자동분류된 건은 행 데이터를 assignedRows가 직접 들고 온다.
            const assignedRowByKey = new Map(
              (current.assignedRows ?? []).map((entry) => [entry.key, entry.row])
            );

            const list = rowsInScope(current, scope).map((entry) => {
              const rows = entry.region ? current.pendingRowsByRegion?.[entry.region] ?? [] : [];
              const at = entry.region
                ? (current.pendingKeysByRegion?.[entry.region] ?? []).indexOf(entry.key)
                : -1;
              return {
                key: entry.key,
                region: entry.region,
                row: assignedRowByKey.get(entry.key) ?? rows[at] ?? [],
                choices: entry.choices,
                assignedDept: entry.assignedDept,
              };
            });

            // 정렬. 숫자로 읽히면 숫자로, 아니면 한국어 기준 문자열로 비교한다.
            // 값이 비어 있는 행은 항상 뒤로 보낸다 — 오름/내림을 오갈 때마다
            // 빈 칸이 맨 위로 올라오면 정작 볼 것이 가려진다.
            const sortValue = (item: { region: Region | null; row: any[] }) =>
              pendingSort.by === 'region' ? item.region ?? '' : item.row[pendingSort.by];

            const dir = pendingSort.order === 'asc' ? 1 : -1;
            list.sort((a, b) => {
              const av = sortValue(a);
              const bv = sortValue(b);
              const aEmpty = av === null || av === undefined || av === '';
              const bEmpty = bv === null || bv === undefined || bv === '';
              if (aEmpty && bEmpty) return 0;
              if (aEmpty) return 1;
              if (bEmpty) return -1;

              const aNum = Number(av);
              const bNum = Number(bv);
              if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) return (aNum - bNum) * dir;

              return String(av).localeCompare(String(bv), 'ko-KR') * dir;
            });

            return list.map(({ key, region, row, choices, assignedDept }) => (
              <tr key={`${region}-${key}`} className={styles.pendingRow}>
                {/* 주소를 못 읽은 자동분류 건은 지역이 없다 */}
                <td className={styles.pendingRegionCell}>{region ?? '-'}</td>
                {row.map((cell, i) => (
                  <td key={i} className={styles.pendingDataCell}>
                    {cell ?? '-'}
                  </td>
                ))}
                <td className={styles.pendingDeptCell}>
                  <div className={styles.pendingSelectWrap}>
                    <select
                      className={styles.regionSelect}
                      required
                      /* 규칙이 정한 건은 그 소속이 골라져 있는 채로 보여준다.
                         비워 두면 이미 정해진 건까지 다시 골라야 하는 줄 안다. */
                      value={rowPicks[key] ?? assignedDept ?? ''}
                      onChange={(e) =>
                        onPickRow(key, e.target.value)
                      }
                    >
                      <option value="" hidden disabled>
                        소속 선택
                      </option>
                      {/*
                        후보는 행마다 다르다 — 같은 지역이라도 나이 구간이 다르면
                        받는 소속이 갈린다. 서버가 그 행 기준으로 좁혀 보낸 것을 쓴다.
                      */}
                      {choices.map((dept) => (
                        <option key={dept} value={dept}>
                          {dept}
                        </option>
                      ))}
                    </select>
                    <MdArrowDropDown className={styles.pendingSelectCaret} />
                  </div>
                </td>
              </tr>
            ));
          })()}
        </tbody>
      </table>
    </div>
  </div>
  );
});

export default PendingAssignTable;
