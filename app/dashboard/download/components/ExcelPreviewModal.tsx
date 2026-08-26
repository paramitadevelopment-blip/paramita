'use client';

import { memo, useState, useEffect, useMemo } from 'react';
import { MdClose, MdArrowDropUp, MdArrowDropDown } from 'react-icons/md';
import * as XLSX from 'xlsx';
import { formatCellValue } from '@/lib/excelCell';
import { badgesFromSheets } from '@/lib/duplicateSummary';
import styles from '../page.module.css';

interface PreviewData {
  headers: string[];
  rows: any[][];
}

interface ExcelPreviewModalProps {
  /** 엑셀 파일을 직접 파싱해서 보여줄 때 */
  file?: File;
  /** 이미 파싱된 데이터를 보여줄 때 (분류 결과 미리보기 등) */
  data?: PreviewData;
  /** data를 넘길 때 헤더에 표시할 제목 */
  title?: string;
  /** 총 건수 옆에 붙일 갈래별 건수. 비면 아무것도 안 그린다 */
  summary?: Array<{ sheet: string; count: number }>;
  onClose: () => void;
}

const ExcelPreviewModal = memo(function ExcelPreviewModal({
  file,
  data: providedData,
  title,
  summary,
  onClose,
}: ExcelPreviewModalProps) {
  const [allSheets, setAllSheets] = useState<Record<string, PreviewData>>({});
  /** 파일을 직접 읽을 때만 채워진다. 시트 이름 → 데이터 행 수 */
  const [sheetRowCounts, setSheetRowCounts] = useState<Record<string, number>>({});
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  // 열 번호로 정렬한다. null이면 원본 순서 그대로다.
  const [sort, setSort] = useState<{ col: number; order: 'asc' | 'desc' } | null>(null);
  const [parsing, setParsing] = useState(!!file);
  const [error, setError] = useState<string | null>(null);

  // providedData가 있으면 파싱 없이 그대로 사용
  const data = providedData ?? allSheets[selectedSheet];

  /**
   * 정렬된 행. 원본 배열은 건드리지 않는다 — 미리보기에서 정렬했다고
   * 실제 배포 순서까지 바뀌면 안 된다.
   *
   * 값이 비어 있는 행은 오름/내림 어느 쪽이든 뒤로 보낸다. 빈 칸이 맨 위로
   * 올라오면 정작 봐야 할 것이 가려진다.
   */
  const sortedRows = useMemo(() => {
    if (!data) return [];

    // 원래 몇 번째 행이었는지를 함께 들고 다닌다. 정렬하면 순서가 바뀌는데
    // 화면 위치를 key로 쓰면 React가 다른 행의 DOM을 재사용한다.
    const indexed = data.rows.map((row, sourceIndex) => ({ row, sourceIndex }));
    if (!sort) return indexed;

    const dir = sort.order === 'asc' ? 1 : -1;
    return indexed.sort((x, y) => {
      const a = x.row;
      const b = y.row;
      const av = formatCellValue(a[sort.col]);
      const bv = formatCellValue(b[sort.col]);
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
  }, [data, sort]);

  const toggleSort = (col: number) => {
    setSort((prev) =>
      prev && prev.col === col
        ? { col, order: prev.order === 'asc' ? 'desc' : 'asc' }
        : { col, order: 'asc' }
    );
  };
  const loading = providedData ? false : parsing;

  // 분류 화면은 서버가 센 값을 넘겨준다. 파일을 직접 열어본 자리에는 그게 없으므로
  // 파일 안 중복 시트에서 센다.
  const badges = summary ?? badgesFromSheets(sheetRowCounts);

  // 배정날짜는 모든 행이 동일하므로 한 번만 계산한다.
  // toISOString()은 UTC를 반환하므로 로컬 시각 포맷을 쓴다.
  const now = new Date();
  const assignedAt = `${now.toLocaleDateString('ko-KR').slice(0, -1)} ${now.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })}`;

  useEffect(() => {
    if (!file) return;

    const readFile = async () => {
      try {
        const buffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(buffer);
        // cellDates를 주지 않으면 날짜 셀이 46245 같은 일련번호로 보인다.
        const workbook = XLSX.read(uint8Array, { type: 'array', cellDates: true });

        const sheetMap: Record<string, PreviewData> = {};

        // 모든 시트 파싱
        for (const sheetName of workbook.SheetNames) {
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

          if (jsonData.length === 0) continue;

          const allHeaders = (jsonData[0] || []).map((h) => String(h || ''));
          const allRows = jsonData.slice(1);

          // 빈 열 제거
          const validColIndices: number[] = [];
          for (let i = 0; i < allHeaders.length; i++) {
            const headerIsEmpty = !allHeaders[i] || allHeaders[i].trim() === '';
            const allCellsEmpty = allRows.every((row) => !row[i] || String(row[i]).trim() === '');

            if (!headerIsEmpty || !allCellsEmpty) {
              validColIndices.push(i);
            }
          }

          // 유효한 열만 추출
          const headers = validColIndices.map((i) => allHeaders[i]);
          const rows = allRows.map((row) => validColIndices.map((i) => row[i]));

          sheetMap[sheetName] = { headers, rows };
        }

        if (Object.keys(sheetMap).length === 0) {
          setError('파일에 데이터가 없습니다.');
          setParsing(false);
          return;
        }

        // 배포된 원본 파일에는 중복 시트가 이미 들어 있다. 서버가 준 목록이
        // 없는 자리(파일을 직접 열어볼 때)에서는 여기서 세어 머리말에 띄운다.
        setSheetRowCounts(
          Object.fromEntries(
            Object.entries(sheetMap).map(([name, sheet]) => [
              name,
              sheet.rows.filter((row) => row.some((c) => String(c ?? '').trim() !== '')).length,
            ])
          )
        );
        setAllSheets(sheetMap);
        setSelectedSheet(workbook.SheetNames[0]);
        setError(null);
      } catch (err) {
        setError('파일을 읽을 수 없습니다.');
      } finally {
        setParsing(false);
      }
    };

    readFile();
  }, [file]);

  return (
    <div className={styles.excelModal}>
      <div className={styles.excelModalContent}>
        <div className={styles.excelModalHeader}>
          <div>
            <h2>{title ?? file?.name ?? '미리보기'}</h2>
            {data && (
              <div className={styles.previewCount}>
                <span>총 {data.rows.length}건</span>
                {/* 0건인 갈래는 흐리게 둔다. 걸린 것만 눈에 들어와야 한다. */}
                {badges.map(({ sheet, count }) => (
                  <span
                    key={sheet}
                    className={`${styles.dupBadge} ${count === 0 ? styles.dupBadgeZero : ''}`}
                  >
                    {sheet}
                    <strong>{count}</strong>
                  </span>
                ))}
              </div>
            )}
          </div>
          <button className={styles.closeBtn} onClick={onClose}>
            <MdClose />
          </button>
        </div>

        {Object.keys(allSheets).length > 1 && (
          <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #e0e0e0', paddingBottom: '8px', marginBottom: '12px' }}>
            {Object.keys(allSheets).map((sheetName) => (
              <button
                key={sheetName}
                onClick={() => {
                  setSelectedSheet(sheetName);
                  // 시트마다 열 구성이 달라 같은 열 번호가 다른 값을 가리킨다.
                  setSort(null);
                }}
                style={{
                  padding: '6px 12px',
                  border: 'none',
                  borderBottom: selectedSheet === sheetName ? '2px solid #db1a62' : 'none',
                  background: 'none',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: selectedSheet === sheetName ? 600 : 500,
                  color: selectedSheet === sheetName ? '#db1a62' : '#666',
                }}
              >
                {sheetName}
              </button>
            ))}
          </div>
        )}

        <div className={styles.excelModalBody}>
          {loading ? (
            <div className={styles.loadingCenter}>로드 중...</div>
          ) : error ? (
            <div className={styles.errorCenter}>{error}</div>
          ) : data ? (
            <div className={styles.tableWrapper}>
              <table className={styles.excelTable}>
                <thead>
                  <tr>
                    {data.headers.map((header, idx) => (
                      <th
                        key={idx}
                        className={styles.excelSortableTh}
                        onClick={() => toggleSort(idx)}
                      >
                        <span className={styles.excelThInner}>
                          {header}
                          {sort?.col === idx &&
                            (sort.order === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />)}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map(({ row, sourceIndex }) => (
                    <tr key={sourceIndex}>
                      {data.headers.map((_, colIdx) => (
                        // Date를 그대로 넘기면 React가 "Objects are not valid as a
                        // React child"로 터진다. cellDates로 읽으므로 반드시 거친다.
                        <td key={colIdx}>{(formatCellValue(row[colIdx]) as React.ReactNode) ?? '-'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
});

export default ExcelPreviewModal;
