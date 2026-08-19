'use client';

import { memo, useState, useEffect } from 'react';
import { MdClose } from 'react-icons/md';
import * as XLSX from 'xlsx';
import { formatCellValue } from '@/lib/excelCell';
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
  onClose: () => void;
}

const ExcelPreviewModal = memo(function ExcelPreviewModal({
  file,
  data: providedData,
  title,
  onClose,
}: ExcelPreviewModalProps) {
  const [allSheets, setAllSheets] = useState<Record<string, PreviewData>>({});
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [parsing, setParsing] = useState(!!file);
  const [error, setError] = useState<string | null>(null);

  // providedData가 있으면 파싱 없이 그대로 사용
  const data = providedData ?? allSheets[selectedSheet];
  const loading = providedData ? false : parsing;

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
    <div className={styles.modal}>
      <div className={styles.excelModalContent}>
        <div className={styles.excelModalHeader}>
          <div>
            <h2>{title ?? file?.name ?? '미리보기'}</h2>
            {data && <p style={{ margin: '4px 0 0 0', fontSize: '22px', color: '#666' }}>총 {data.rows.length}건</p>}
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
                onClick={() => setSelectedSheet(sheetName)}
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
                      <th key={idx}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, rowIdx) => (
                    <tr key={rowIdx}>
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
