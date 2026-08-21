'use client';

import { memo } from 'react';
import { MdArrowDropUp, MdArrowDropDown } from 'react-icons/md';
import { SELECTABLE_REGIONS } from '@/lib/insurance';
import type { ClassifiedFile, SelectableRegion } from '@/app/hooks/useAutoClassify';
import styles from '../page.module.css';

interface PendingAssignTableProps {
  current: ClassifiedFile;
  currentIndex: number;
  pickMode: 'manual' | 'auto';
  onPickMode: (fileIdx: number, mode: 'manual' | 'auto') => void;
  pendingSort: { by: 'region' | number; order: 'asc' | 'desc' };
  onToggleSort: (by: 'region' | number) => void;
  /** 좁게 눌러도 되는 열 (tel1 등) */
  narrowCols: Set<number>;
  /** 주문번호 → 소속명 */
  rowPicks: Record<string, string>;
  onPickRow: (key: string, dept: string) => void;
  regionChoices: Record<string, string[]>;
}

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
  narrowCols,
  rowPicks,
  onPickRow,
  regionChoices,
}: PendingAssignTableProps) {
  // 고를 것이 없으면 이 영역 자체를 그리지 않는다.
  const hasPending = Object.values(current.pendingByRegion ?? {}).some((c) => c > 0);
  if (!hasPending) return null;

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
            {Object.entries(current.pendingByRegion ?? {}).map(([region, count]) => {
              const regionColors: Record<string, string> = {
                '서울': '#2196F3',
                '경기': '#4CAF50',
                '인천': '#FF9800',
                '강원': '#9C27B0',
              };
              return (
                <span key={region} style={{ color: regionColors[region] || '#666' }}>
                  {region} : {count}건
                </span>
              );
            })}
          </div>
        </div>
      </div>

    {/* 선택 방식. 자동은 같은 표에 값만 미리 채워 넣는다 — 채운 뒤에도 고칠 수 있다. */}
    <div className={styles.pickModeTabs}>
      {([
        { mode: 'manual' as const, label: '직접선택' },
        { mode: 'auto' as const, label: '자동선택' },
      ]).map(({ mode, label }) => {
        const active = pickMode === mode;
        return (
          <button
            key={mode}
            type="button"
            className={`${styles.pickModeTab} ${active ? styles.pickModeTabActive : ''}`}
            onClick={() => onPickMode(currentIndex, mode)}
          >
            {label}
          </button>
        );
      })}
    </div>

    <div style={{ overflowX: 'auto', marginBottom: '12px' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '16px',
          minWidth: '200px',
          // 열이 내용대로 늘어나면 표가 화면을 넘겨 '배정 소속'이 스크롤 밖으로
          // 나간다. 주어진 폭 안에서 열을 나눠 가져 전부 한눈에 보이게 한다.
          tableLayout: 'fixed',
        }}
      >
        <thead>
          <tr style={{ background: '#fafafa', borderBottom: '2px solid #ddd' }}>
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
                className={`${styles.pendingSortableTh} ${narrowCols.has(colIdx) ? styles.pendingNarrowCol : ''}`}
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
            const list: Array<{ key: string; region: SelectableRegion; row: any[] }> = [];
            SELECTABLE_REGIONS.forEach((r) => {
              const rows = current.pendingRowsByRegion?.[r] ?? [];
              const keys = current.pendingKeysByRegion?.[r] ?? [];
              rows.forEach((row, i) => {
                // 키는 서버가 만들어 보낸 것을 그대로 쓴다. 여기서 다시 만들면
                // 배포가 쓰는 키와 규칙이 갈려 선택이 엉뚱한 행에 붙는다.
                const key = keys[i];
                if (key === undefined) return;
                list.push({ key, region: r, row });
              });
            });

            // 정렬. 숫자로 읽히면 숫자로, 아니면 한국어 기준 문자열로 비교한다.
            // 값이 비어 있는 행은 항상 뒤로 보낸다 — 오름/내림을 오갈 때마다
            // 빈 칸이 맨 위로 올라오면 정작 볼 것이 가려진다.
            const sortValue = (item: { region: SelectableRegion; row: any[] }) =>
              pendingSort.by === 'region' ? item.region : item.row[pendingSort.by];

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

            return list.map(({ key, region, row }) => (
              <tr key={`${region}-${key}`} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '10px 12px', textAlign: 'center', color: '#666', fontSize: '16px', whiteSpace: 'nowrap' }}>{region}</td>
                {row.map((cell, i) => (
                  <td
                    key={i}
                    className={`${styles.pendingDataCell} ${narrowCols.has(i) ? styles.pendingNarrowCol : ''}`}
                    title={String(cell ?? '')}
                  >
                    {cell ?? '-'}
                  </td>
                ))}
                <td style={{ padding: '10px 12px' }}>
                  <div style={{ position: 'relative' }}>
                    <select
                      className={styles.regionSelect}
                      required
                      value={rowPicks[key] ?? ''}
                      onChange={(e) =>
                        onPickRow(key, e.target.value)
                      }
                    >
                      <option value="" hidden disabled>
                        소속 선택
                      </option>
                      {(regionChoices[region] ?? []).map((dept) => (
                        <option key={dept} value={dept}>
                          {dept}
                        </option>
                      ))}
                    </select>
                    <MdArrowDropDown
                      style={{
                        position: 'absolute',
                        right: '6px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        pointerEvents: 'none',
                        fontSize: '16px',
                        color: '#666',
                      }}
                    />
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
