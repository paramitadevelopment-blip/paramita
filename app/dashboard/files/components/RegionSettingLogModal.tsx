'use client';

import { useMemo, useState } from 'react';
import { MdClose } from 'react-icons/md';
import { useAssignmentRuleLogs, type AssignmentRuleLog } from '@/app/hooks/useAssignmentRules';
import {
  diffAssignmentRules,
  groupLogsByDay,
  toSearchRange,
  type RuleState,
} from '@/lib/assignmentRulesDiff';
import modalStyles from '../page.module.css';
import styles from './RegionSettingLogModal.module.css';

interface RegionSettingLogModalProps {
  onClose: () => void;
}

/**
 * 배정 규칙 저장 이력.
 *
 * 배정이 갑자기 달라졌을 때 "누가 언제 뭘 바꿨나"를 되짚는 자리다.
 * 기록에는 그때의 규칙 전체가 담기고, 바로 앞 기록과 견준 차이만 보여준다 —
 * 전체를 늘어놓으면 뭐가 달라졌는지 사람이 눈으로 찾아야 한다.
 *
 * 날짜를 왼쪽에서 고르고 그날 것만 오른쪽에 본다. 한 표에 다 쌓으면
 * 기록이 늘수록 스크롤만 길어져 정작 찾는 날을 못 찾는다.
 */

/**
 * 표에 넣을 시각. 08:54:43 꼴로 고정한다.
 *
 * toLocaleTimeString('ko-KR')은 '8시 54분 43초'로 풀어 써서 칸이 넓어지고
 * 자리수가 들쭉날쭉해 세로로 훑을 수가 없다.
 */
function formatTime(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`;
}

/**
 * 한 시점의 설정 상태. 지역과 나이를 줄을 나눠 보여준다 —
 * 한 줄에 이어 붙이면 어디까지가 지역이고 어디부터 나이인지 구분이 안 된다.
 */
function RuleStateCell({ state }: { state: RuleState }) {
  const empty = state.regions.length === 0 && state.brackets.length === 0;
  if (empty) return <span className={styles.none}>설정 없음</span>;

  return (
    <div className={styles.stateBox}>
      <div className={styles.stateLine}>
        <span className={styles.stateTag}>지역</span>
        {state.regions.length > 0 ? state.regions.join(' · ') : <span className={styles.none}>없음</span>}
      </div>
      <div className={styles.stateLine}>
        <span className={styles.stateTag}>나이</span>
        {state.brackets.length > 0 ? state.brackets.join(' · ') : <span className={styles.none}>없음</span>}
      </div>
    </div>
  );
}

/** 늘거나 준 것. 없으면 칸을 비우지 않고 표시를 남긴다 — 빈 칸은 "못 읽었나"로 보인다 */
function DeltaCell({
  regions,
  brackets,
  tone,
}: {
  regions: string[];
  brackets: string[];
  tone: string;
}) {
  if (regions.length === 0 && brackets.length === 0) {
    return <span className={styles.none}>—</span>;
  }

  return (
    <div className={styles.deltaBox}>
      {regions.map((region) => (
        <span key={region} className={`${styles.chip} ${tone}`}>
          {region}
        </span>
      ))}
      {brackets.map((bracket) => (
        <span key={bracket} className={`${styles.chip} ${tone}`}>
          {bracket}
        </span>
      ))}
    </div>
  );
}

export default function RegionSettingLogModal({ onClose }: RegionSettingLogModalProps) {
  /** 조회할 기간. 둘 다 비어 있으면 최근 것부터 본다 */
  const [fromDay, setFromDay] = useState('');
  const [toDay, setToDay] = useState('');
  const range = useMemo(() => toSearchRange(fromDay, toDay), [fromDay, toDay]);
  /* 날짜를 거꾸로 넣으면 늘 0건이 나온다. 조회를 안 하고 왜 그런지 알려준다. */
  const invalidRange = Boolean(fromDay && toDay && fromDay > toDay);
  const searching = Boolean(range);

  const { data, isLoading } = useAssignmentRuleLogs(true, range);
  /** 왼쪽 목록에서 고른 날짜. 안 골랐으면 가장 최근 날 */
  const [pickedDay, setPickedDay] = useState<string | null>(null);

  const days = useMemo(
    () => groupLogsByDay(data?.logs ?? [], (log) => new Date(log.changedAt)),
    [data]
  );

  const shownDay = days.find((d) => d.key === pickedDay) ?? days[0];

  /*
   * 이 기록의 바로 앞 기록. 목록 전체에서 찾아야 날짜가 갈려도 이어진다.
   * 목록의 마지막 줄은 짝이 목록 밖에 있어 서버가 따로 보내 준 것을 쓴다.
   */
  const previousRules = (log: AssignmentRuleLog) => {
    const all = data?.logs ?? [];
    const at = all.findIndex((l) => l.id === log.id);
    if (at < 0) return undefined;
    return all[at + 1]?.rules ?? data?.previous?.rules;
  };

  return (
    <div className={modalStyles.modal}>
      <div className={`${modalStyles.modalContent} ${styles.logModalContent}`}>
        <div className={modalStyles.modalTitleBar}>
          <h2 className={modalStyles.modalTitle}>지역 설정 저장 이력</h2>
          <button
            type="button"
            className={modalStyles.modalCloseBtn}
            onClick={onClose}
            aria-label="닫기"
          >
            <MdClose />
          </button>
        </div>

        {/* 기록은 계속 쌓인다. 최근 것만으로는 못 가는 날을 여기서 짚는다 */}
        <div className={styles.searchBar}>
          <label className={styles.searchLabel} htmlFor="rule-log-from">
            조회 기간
          </label>
          <input
            id="rule-log-from"
            type="date"
            className={styles.searchInput}
            value={fromDay}
            max={toDay || undefined}
            onChange={(e) => {
              setFromDay(e.target.value);
              // 기간이 바뀌면 왼쪽에서 고른 날은 의미가 없어진다.
              setPickedDay(null);
            }}
          />
          <span className={styles.searchTilde}>~</span>
          <input
            id="rule-log-to"
            type="date"
            className={styles.searchInput}
            value={toDay}
            min={fromDay || undefined}
            onChange={(e) => {
              setToDay(e.target.value);
              setPickedDay(null);
            }}
          />

          {(fromDay || toDay) && (
            <button
              type="button"
              className={styles.searchClear}
              onClick={() => {
                setFromDay('');
                setToDay('');
                setPickedDay(null);
              }}
            >
              최근 기록 보기
            </button>
          )}

          <span className={styles.searchHint}>
            {invalidRange
              ? '시작일이 종료일보다 늦습니다.'
              : searching
                ? '그 기간에 저장된 것만 보여줍니다.'
                : '최근 30건을 보여줍니다.'}
          </span>
        </div>

        {isLoading ? (
          <div className={styles.logEmpty}>불러오는 중입니다...</div>
        ) : days.length === 0 ? (
          <div className={styles.logEmpty}>
            {searching ? '그 기간에는 저장한 기록이 없습니다.' : '아직 저장한 적이 없습니다.'}
          </div>
        ) : (
          <div className={styles.split}>
            {/* 날짜 목록. 며칠에 걸쳐 쌓여도 여기는 한눈에 들어온다 */}
            <div className={styles.dayList}>
              {days.map((day) => (
                <button
                  key={day.key}
                  type="button"
                  className={`${styles.dayBtn} ${
                    day.key === shownDay?.key ? styles.dayBtnOn : ''
                  }`}
                  onClick={() => setPickedDay(day.key)}
                >
                  <span className={styles.dayLabel}>{day.label}</span>
                  <span className={styles.dayCount}>{day.logs.length}건</span>
                </button>
              ))}
              {data?.hasMore && <div className={styles.logMore}>더 있음 (잘림)</div>}
            </div>

            {/* 고른 날짜의 기록 */}
            <div className={styles.dayDetail}>
              <table className={styles.logTable}>
                <thead>
                  <tr>
                    <th className={styles.timeCol}>시각</th>
                    <th className={styles.whoCol}>저장한 사람</th>
                    <th className={styles.groupCol}>소속</th>
                    <th className={styles.stateCol}>이전 상태</th>
                    <th className={styles.deltaCol}>추가</th>
                    <th className={styles.deltaCol}>제거</th>
                    <th className={styles.stateCol}>적용 후 상태</th>
                  </tr>
                </thead>
                <tbody>
                  {shownDay?.logs.map((log) => {
                    const before = previousRules(log);
                    const changes = before ? diffAssignmentRules(before, log.rules) : [];
                    const at = new Date(log.changedAt);
                    const who = log.changedByName
                      ? `${log.changedBy}(${log.changedByName})`
                      : log.changedBy ?? '알 수 없음';

                    // 바뀐 소속이 없으면 한 줄로 끝낸다.
                    if (changes.length === 0) {
                      return (
                        <tr key={log.id} className={styles.logRow}>
                          <td className={styles.timeCol}>{formatTime(at)}</td>
                          <td className={styles.whoCol}>{who}</td>
                          <td colSpan={5} className={styles.none}>
                            {before ? '바뀐 내용 없음' : '처음 저장'}
                          </td>
                        </tr>
                      );
                    }

                    /*
                     * 한 번 저장에 여러 소속이 바뀐다. 소속마다 줄을 나누고
                     * 시각·사람은 첫 줄에서 아래로 이어 붙인다 — 줄마다 같은
                     * 시각을 반복하면 몇 번 저장한 것인지 세기가 어렵다.
                     */
                    return changes.map((change, ci) => (
                      <tr
                        key={`${log.id}-${change.group}`}
                        className={ci === 0 ? styles.logRow : undefined}
                      >
                        {ci === 0 && (
                          <>
                            <td className={styles.timeCol} rowSpan={changes.length}>
                              {formatTime(at)}
                            </td>
                            <td className={styles.whoCol} rowSpan={changes.length}>
                              {who}
                            </td>
                          </>
                        )}
                        <td className={styles.groupCol}>
                          <b>{change.group}</b>
                        </td>
                        <td className={styles.stateCol}>
                          <RuleStateCell state={change.before} />
                        </td>
                        <td className={styles.deltaCol}>
                          <DeltaCell
                            regions={change.addedRegions}
                            brackets={change.addedBrackets}
                            tone={styles.added}
                          />
                        </td>
                        <td className={styles.deltaCol}>
                          <DeltaCell
                            regions={change.removedRegions}
                            brackets={change.removedBrackets}
                            tone={styles.removed}
                          />
                        </td>
                        <td className={styles.stateCol}>
                          <RuleStateCell state={change.after} />
                        </td>
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className={styles.footer}>
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
