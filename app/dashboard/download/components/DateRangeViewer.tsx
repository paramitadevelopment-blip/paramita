'use client';

import React, { memo, useEffect, useMemo, useState } from 'react';
import { MdChevronLeft, MdChevronRight, MdDateRange, MdSearch, MdToday } from 'react-icons/md';
import { useDateRangeRows } from '@/app/hooks/useDateRangeRows';
import { useAlert } from '@/app/components/Alert/Alert';
import { RANGE_DEPT_COLUMN } from '@/lib/rangeRows';
import type { InsurerCount } from '@/app/hooks/useDateRangeRows';
import ExcelPreviewModal from './ExcelPreviewModal';
import styles from '../page.module.css';

/**
 * 기간 조회 — 두 날짜를 고르고 [조회]를 누르면 그 사이에 배포된 행이
 * 미리보기 창에 한 표로 뜬다. [이번달]은 이달 1일부터 오늘까지를 바로 연다.
 *
 * 창 안에는 소속 단추가 줄지어 있다. 단추마다 그 소속이 받은 건수와 하루
 * 평균이 적혀 있고, 누르면 표가 그 소속 건만 남는다. 관리자가 이걸 여는
 * 이유의 절반은 "이달 어느 지사에 몇 건, 하루에 몇 건씩 갔나"라 표를
 * 세로로 훑어 세게 두면 안 된다. 지사는 자기 소속 단추 하나만 온다.
 *
 * **눈으로만 본다.** 엑셀로 내려받는 버튼이 없고, 표 위에서 글자를 긁어
 * 복사하거나 끌어 놓는 것도 막아 둔다. 가져가는 건 여전히 파일로만 한다.
 * 막는 것은 실수와 손버릇을 막는 정도다 — 화면을 사진 찍는 것까지 막을 수는 없다.
 */

/** 오늘을 'YYYY-MM-DD'로. 사용자 시간대 기준이다. */
const today = () => {
  const now = new Date();
  const shifted = new Date(now.getTime() - now.getTimezoneOffset() * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
};
const firstOfMonth = () => `${today().slice(0, 7)}-01`;

/** 복사·잘라내기·끌기·우클릭을 막는다. 표를 감싼 자리에 한 번만 건다. */
const block = (e: React.SyntheticEvent) => {
  e.preventDefault();
};

interface DateRangeViewerProps {
  /** 조회한 기간. 아래 파일 목록도 같은 기간으로 거른다. null 이면 전체 기간 */
  onApply?: (span: { from: string; to: string } | null) => void;
}

const DateRangeViewer = memo(function DateRangeViewerComponent({ onApply }: DateRangeViewerProps) {
  const { showAlert } = useAlert();
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  /*
   * 하루만 보기. 켜면 달력이 하나가 되고 그날 하루만 조회한다.
   *
   * 기간으로 훑다가 "그럼 어제는?"으로 좁히는 일이 잦은데, 그때마다 두 칸에
   * 같은 날짜를 두 번 넣어야 했다. 한 칸으로 줄여 그 수고를 없앤다.
   */
  const [oneDay, setOneDay] = useState(false);
  const [day, setDay] = useState(today);
  // 조회를 누른 기간. 입력칸과 따로 둬야 날짜를 고치는 동안 창이 안 바뀐다.
  const [asked, setAsked] = useState<{ from: string; to: string } | null>(null);
  // 창 안에서 고른 소속. null이면 전부.
  const [dept, setDept] = useState<string | null>(null);
  // 파일 목록에 기간이 걸려 있는가. 걸려 있을 때만 [전체 기간]을 보인다.
  const [applied, setApplied] = useState(false);
  const range = useDateRangeRows(asked?.from ?? '', asked?.to ?? '', asked !== null);

  const ask = (span: { from: string; to: string }) => {
    if (!span.from || !span.to) {
      showAlert({ type: 'warning', title: '기간 조회', message: '시작일과 종료일을 모두 선택해 주세요.' });
      return;
    }
    if (span.from > span.to) {
      showAlert({ type: 'warning', title: '기간 조회', message: '종료일이 시작일보다 앞입니다.' });
      return;
    }
    setDept(null);
    setAsked(span);
    setApplied(true);
    onApply?.(span);
  };

  /** 이달 1일 ~ 오늘. 입력칸도 그 값으로 맞춰 둔다 — 뭘 조회했는지 보여야 한다. */
  const askThisMonth = () => {
    const span = { from: firstOfMonth(), to: today() };
    setFrom(span.from);
    setTo(span.to);
    ask(span);
  };

  /** 오늘 하루. 하루만 보기일 때 [이번달] 자리에 대신 선다. */
  const askToday = () => {
    setDay(today());
    ask({ from: today(), to: today() });
  };

  /*
   * 창 안에서 날짜를 바꾼다. 누르는 즉시 다시 불러온다 — 창을 닫았다 여는
   * 수고를 없애는 것이 이 자리의 이유다. 입력칸도 함께 맞춰 둔다.
   */
  const jump = (span: { from: string; to: string }) => {
    if (span.from === span.to) setDay(span.from);
    else {
      setFrom(span.from);
      setTo(span.to);
    }
    setDept(null);
    setAsked(span);
    setApplied(true);
    onApply?.(span);
  };

  /** 하루씩 앞뒤로. 달을 넘어가도 알아서 넘어간다. */
  const shiftDay = (days: number) => {
    const base = asked ? asked.from : day;
    const d = new Date(base + 'T00:00:00');
    d.setDate(d.getDate() + days);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    jump({ from: next, to: next });
  };

  // 실패는 창 대신 알림으로. 그리는 도중에 상태를 바꾸면 안 되므로 효과로 뺀다.
  useEffect(() => {
    if (!asked || !range.isError) return;
    showAlert({ type: 'error', title: '기간 조회 실패', message: (range.error as Error).message });
    setAsked(null);
  }, [asked, range.isError, range.error, showAlert]);

  /*
   * 고른 소속의 행만. 소속 열은 서버가 앞쪽에 붙여 보내므로 머리글에서 찾는다.
   * 수천 줄을 거르는 일이라 소속을 바꿀 때만 다시 센다.
   */
  const shown = useMemo(() => {
    if (!range.data) return null;
    if (!dept) return range.data.rows;
    const at = range.data.headers.indexOf(RANGE_DEPT_COLUMN);
    if (at < 0) return range.data.rows;
    return range.data.rows.filter((row) => row[at] === dept);
  }, [range.data, dept]);

  /*
   * 창 안의 날짜 줄. 하루를 보는 중이면 앞뒤 단추가 함께 선다.
   *
   * 창을 닫고 바에서 다시 고르는 것이 이 기능을 쓰는 내내 반복되던 일이라,
   * 보고 있는 자리에서 바로 옮길 수 있게 한다.
   */
  const oneDayAsked = asked !== null && asked.from === asked.to;
  const dateBar = !asked ? null : (
    <div className={styles.rangeJump}>
      {oneDayAsked ? (
        <>
          <button
            type="button"
            className={styles.rangeJumpBtn}
            onClick={() => shiftDay(-1)}
            disabled={range.isFetching}
            aria-label="앞날"
            title="하루 앞"
          >
            <MdChevronLeft />
          </button>
          <input
            type="date"
            className={styles.rangeInput}
            value={asked.from}
            onChange={(e) => e.target.value && jump({ from: e.target.value, to: e.target.value })}
            aria-label="날짜"
          />
          <button
            type="button"
            className={styles.rangeJumpBtn}
            onClick={() => shiftDay(1)}
            disabled={range.isFetching}
            aria-label="뒷날"
            title="하루 뒤"
          >
            <MdChevronRight />
          </button>
        </>
      ) : (
        <>
          <input
            type="date"
            className={styles.rangeInput}
            value={asked.from}
            max={asked.to}
            onChange={(e) => e.target.value && jump({ from: e.target.value, to: asked.to })}
            aria-label="시작일"
          />
          <span className={styles.rangeTilde}>~</span>
          <input
            type="date"
            className={styles.rangeInput}
            value={asked.to}
            min={asked.from}
            onChange={(e) => e.target.value && jump({ from: asked.from, to: e.target.value })}
            aria-label="종료일"
          />
        </>
      )}
      {range.isFetching && <span className={styles.rangeJumpNote}>불러오는 중…</span>}
    </div>
  );

  /*
   * 보험사별 건수 한 줄. 0건인 보험사는 안 적는다 — 흥국만 온 날에
   * '동양 0'이 서 있으면 읽는 눈이 한 번 더 걸린다.
   */
  const insurerLine = (n: InsurerCount) => {
    const parts: string[] = [];
    if (n.dy > 0) parts.push(`동양 ${n.dy}`);
    if (n.hk > 0) parts.push(`흥국 ${n.hk}`);
    if (n.etc > 0) parts.push(`구분없음 ${n.etc}`);
    if (parts.length === 0) return null;
    return <span className={styles.rangeChipInsurer}>{parts.join(' · ')}</span>;
  };

  /*
   * 소속 단추. 맨 앞은 전체다.
   *
   * 소속이 하나뿐이면(지사 계정) 고를 게 없다. [전체 9건] [한울부원 9건]처럼
   * 같은 숫자가 둘 서 있으면 뭘 눌러야 하나 싶어진다. 그때는 단추 없이
   * 그 소속의 건수와 하루 평균만 한 줄로 보여준다.
   */
  const single = range.data && range.data.byDepartment.length <= 1 ? range.data.byDepartment[0] : null;
  const chips = !range.data ? null : single ? (
    <div className={styles.rangeChips}>
      <span className={styles.rangeStat}>
        {single.department}
        <span className={styles.rangeChipCount}>{single.count}건</span>
        <span className={styles.rangeChipAvg}>
          일평균 {single.dailyAverage} ({range.data.days}일)
        </span>
        {insurerLine(single.byInsurer)}
      </span>
    </div>
  ) : (
    <div className={styles.rangeChips}>
      <button
        type="button"
        className={`${styles.rangeChip} ${dept === null ? styles.rangeChipActive : ''}`}
        onClick={() => setDept(null)}
      >
        전체
        <span className={styles.rangeChipCount}>{range.data.total}건</span>
        <span className={styles.rangeChipAvg}>일평균 {range.data.dailyAverage}</span>
        {insurerLine(range.data.byInsurer)}
      </button>
      {range.data.byDepartment.map((d) => (
        <button
          key={d.department}
          type="button"
          className={`${styles.rangeChip} ${dept === d.department ? styles.rangeChipActive : ''}`}
          onClick={() => setDept((prev) => (prev === d.department ? null : d.department))}
          title={`${d.department}: ${range.data!.days}일 동안 ${d.count}건, 하루 평균 ${d.dailyAverage}건 (동양 ${d.byInsurer.dy} · 흥국 ${d.byInsurer.hk})`}
        >
          {d.department}
          <span className={styles.rangeChipCount}>{d.count}건</span>
          <span className={styles.rangeChipAvg}>일평균 {d.dailyAverage}</span>
          {insurerLine(d.byInsurer)}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <div className={styles.rangeBar}>
        <MdDateRange className={styles.rangeIcon} />
        <span className={styles.rangeLabel}>배포일 기준</span>
        {/* 달력 앞에 둔다 — 무엇을 고를지부터 정하고 날짜를 고르는 차례다. */}
        <label className={styles.rangeCheck}>
          <input
            type="checkbox"
            checked={oneDay}
            onChange={(e) => setOneDay(e.target.checked)}
          />
          하루만 보기
        </label>
        {oneDay ? (
          <input
            type="date"
            className={styles.rangeInput}
            value={day}
            onChange={(e) => setDay(e.target.value)}
            aria-label="날짜"
          />
        ) : (
          <>
            <input
              type="date"
              className={styles.rangeInput}
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="시작일"
            />
            <span className={styles.rangeTilde}>~</span>
            <input
              type="date"
              className={styles.rangeInput}
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              aria-label="종료일"
            />
          </>
        )}
        <button
          type="button"
          className={styles.rangeBtn}
          onClick={() => ask(oneDay ? { from: day, to: day } : { from, to })}
          disabled={range.isFetching}
        >
          <MdSearch />
          {range.isFetching ? '불러오는 중…' : '조회'}
        </button>
        <button
          type="button"
          className={styles.rangeGhostBtn}
          onClick={oneDay ? askToday : askThisMonth}
          disabled={range.isFetching}
        >
          <MdToday />
          {oneDay ? '오늘 조회' : '이번달 조회'}
        </button>
        {applied && (
          <button
            type="button"
            className={styles.rangeGhostBtn}
            onClick={() => {
              setApplied(false);
              onApply?.(null);
            }}
          >
            전체 기간
          </button>
        )}
      </div>

      {asked && range.data && shown && (
        <div
          className={styles.eyesOnly}
          onCopy={block}
          onCut={block}
          onDragStart={block}
          onContextMenu={block}
        >
          <ExcelPreviewModal
            // 하루를 조회하면 같은 날짜를 두 번 적지 않는다.
            title={`${asked.from === asked.to ? asked.from : `${asked.from} ~ ${asked.to}`} 배포 건${dept ? ` · ${dept}` : ''}${range.data.truncated ? ` (앞 ${range.data.rows.length}건만 표시 · 전체 ${range.data.total}건)` : ''}`}
            data={{ headers: range.data.headers, rows: shown }}
            toolbar={<>{dateBar}{chips}</>}
            onClose={() => setAsked(null)}
          />
        </div>
      )}
    </>
  );
});

export default DateRangeViewer;
