'use client';

import { memo, useMemo, useState } from 'react';
import { MdChevronLeft, MdChevronRight, MdExpandLess, MdExpandMore } from 'react-icons/md';
import { useDateRangeRows } from '@/app/hooks/useDateRangeRows';
import { isAssignableDepartmentGroup } from '@/lib/departments';
import type { RowPicks } from '@/lib/pendingPicks';
import { dailyAverage, daysBetween } from '@/lib/rangeRows';
import {
  batchCountsByDept,
  mergeTodayTotals,
  type BatchFile,
  type InsurerCounts,
  type InsurerKey,
} from '@/lib/todayTotals';
import styles from '../page.module.css';

interface TodayTotalsProps {
  departments: ReadonlyArray<{ id: number; name: string; is_admin?: boolean }>;
  files: BatchFile[];
  rowPicks: RowPicks;
}

/** 한국 날짜 'YYYY-MM-DD'. 서버가 배포일을 자르는 경계와 같다. */
const todayKst = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
const firstOfMonthKst = () => `${todayKst().slice(0, 8)}01`;
/** 'YYYY-MM-DD'를 n일 옮긴다. 달력 날짜끼리의 셈이라 UTC로 계산해 시간대를 타지 않는다. */
const addDays = (day: string, n: number) => {
  const t = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10) + n);
  return new Date(t).toISOString().slice(0, 10);
};
const sum = (c: InsurerCounts) => c.hk + c.dy + c.etc;
const LABEL: Record<InsurerKey, string> = { hk: '흥국', dy: '동양', etc: '구분없음' };

/**
 * 배포 합계. 고른 기간에 이미 배포한 건을 지사×보험사로 보이고, 기간에 오늘이
 * 들어 있으면 지금 창의 파일 전부(이번 배포)를 괄호로 더한다 — 이번 배포는
 * 오늘 날짜로 나가므로 지난 기간에는 더하지 않는다.
 *
 * 기본은 오늘 하루다. [하루만 보기]를 풀면 두 날짜 사이를 본다.
 */
const TodayTotals = memo(function TodayTotalsComponent({ departments, files, rowPicks }: TodayTotalsProps) {
  const today = todayKst();
  const [oneDay, setOneDay] = useState(true);
  const [day, setDay] = useState(todayKst);
  const [from, setFrom] = useState(firstOfMonthKst);
  const [to, setTo] = useState(todayKst);
  // 접으면 머리줄만 남는다. 위에 붙어 있는 표라 직접 배정 목록을 가릴 때 치운다.
  const [open, setOpen] = useState(true);

  const span = oneDay ? { from: day, to: day } : { from, to };
  const valid = !!span.from && !!span.to && span.from <= span.to;
  const done = useDateRangeRows(span.from, span.to, valid);
  const includesToday = valid && span.from <= today && today <= span.to;
  const days = valid ? daysBetween(span.from, span.to) : 1;

  const batch = useMemo(
    () => (includesToday ? batchCountsByDept(files, rowPicks, departments) : {}),
    [includesToday, files, rowPicks, departments]
  );

  const rows = mergeTodayTotals(
    departments.filter((d) => isAssignableDepartmentGroup(d.name, !!d.is_admin)).map((d) => d.name),
    done.data?.byDepartment ?? [],
    batch
  );
  const doneAll = rows.reduce((n, r) => n + sum(r.done), 0);
  const batchAll = rows.reduce((n, r) => n + sum(r.batch), 0);
  // 보험사를 못 가린 건이 있을 때만 열을 연다. 늘 0인 열은 읽는 눈만 붙잡는다.
  const cols: InsurerKey[] = rows.some((r) => r.done.etc + r.batch.etc > 0) ? ['hk', 'dy', 'etc'] : ['hk', 'dy'];

  const total = (pick: (r: (typeof rows)[number]) => InsurerCounts) =>
    rows.reduce(
      (acc, r) => {
        const c = pick(r);
        return { hk: acc.hk + c.hk, dy: acc.dy + c.dy, etc: acc.etc + c.etc };
      },
      { hk: 0, dy: 0, etc: 0 }
    );
  const doneSum = total((r) => r.done);
  const batchSum = total((r) => r.batch);

  const cell = (d: number, b: number) => (
    <>
      {d + b}
      {b > 0 && <span className={styles.todayPlus}>(+{b})</span>}
    </>
  );

  const showThisMonth = () => {
    setOneDay(false);
    setFrom(firstOfMonthKst());
    setTo(todayKst());
  };

  const meta = !valid
    ? '날짜를 확인해 주세요'
    : // 날짜를 옮기는 동안은 앞 표를 물고 있으므로, 숫자가 아직 앞 날짜 것임을 알린다.
      done.isFetching
      ? '불러오는 중…'
      : done.isError
        ? '배포 건을 불러오지 못해 이번 배포만 표시'
        : `이미 배포 ${doneAll}건${includesToday ? ` · 이번 배포 ${batchAll}건` : ''} · ${days}일`;

  return (
    <div className={styles.todayTotals}>
      <div className={styles.todayHead}>
        <div className={styles.todayControls}>
          <span className={styles.todayTitle}>
            {span.from === today && span.to === today ? '오늘 합계' : '기간 합계'}
          </span>
          {open && (
            <>
          <label className={styles.todayCheck}>
            <input type="checkbox" checked={oneDay} onChange={(e) => setOneDay(e.target.checked)} />
            하루만 보기
          </label>
          {oneDay ? (
            <span className={styles.todayDayNav}>
              <button
                type="button"
                className={styles.todayNavBtn}
                onClick={() => day && setDay(addDays(day, -1))}
                aria-label="하루 앞"
                title="하루 앞"
              >
                <MdChevronLeft />
              </button>
              <input
                type="date"
                className={styles.todayDate}
                value={day}
                onChange={(e) => setDay(e.target.value)}
                aria-label="날짜"
              />
              <button
                type="button"
                className={styles.todayNavBtn}
                onClick={() => day && setDay(addDays(day, 1))}
                aria-label="하루 뒤"
                title="하루 뒤"
              >
                <MdChevronRight />
              </button>
            </span>
          ) : (
            <>
              <input
                type="date"
                className={styles.todayDate}
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
                aria-label="시작일"
              />
              <span className={styles.todayTilde}>~</span>
              <input
                type="date"
                className={styles.todayDate}
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
                aria-label="종료일"
              />
            </>
          )}
          <button type="button" className={styles.todayGhostBtn} onClick={showThisMonth}>
            이번달 보기
          </button>
            </>
          )}
        </div>
        <div className={styles.todayControls}>
          <span className={styles.todayMeta}>{meta}</span>
          <button
            type="button"
            className={styles.todayGhostBtn}
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {open ? <MdExpandLess /> : <MdExpandMore />}
            {open ? '접기' : '펼치기'}
          </button>
        </div>
      </div>
      {open && (
      <table className={styles.todayTable}>
        <thead>
          <tr>
            <th>지사</th>
            {cols.map((k) => (
              <th key={k}>{LABEL[k]}</th>
            ))}
            <th>합계</th>
            <th>일평균</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.department}>
              <td>{r.department}</td>
              {cols.map((k) => (
                <td key={k}>{cell(r.done[k], r.batch[k])}</td>
              ))}
              <td className={styles.todaySum}>{cell(sum(r.done), sum(r.batch))}</td>
              <td className={styles.todayAvg}>{dailyAverage(sum(r.done) + sum(r.batch), days)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>합계</td>
            {cols.map((k) => (
              <td key={k}>{cell(doneSum[k], batchSum[k])}</td>
            ))}
            <td>{cell(doneAll, batchAll)}</td>
            <td className={styles.todayAvg}>{dailyAverage(doneAll + batchAll, days)}</td>
          </tr>
        </tfoot>
      </table>
      )}
    </div>
  );
});

export default TodayTotals;
