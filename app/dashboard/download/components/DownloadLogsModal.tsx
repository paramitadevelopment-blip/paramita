'use client';

import { memo } from 'react';
import { useDownloadLogs } from '@/app/hooks/useDownloadLogs';
import styles from '../page.module.css';

interface DownloadLogsModalProps {
  fileId: string | null;
  fileName: string;
  isOpen: boolean;
  onClose: () => void;
}

const DownloadLogsModal = memo(function DownloadLogsModal({ fileId, fileName, isOpen, onClose }: DownloadLogsModalProps) {
  const { data: logs = [], isLoading } = useDownloadLogs(fileId, isOpen);

  if (!isOpen || !fileId) return null;

  return (
    // 배경 클릭으로는 닫지 않는다. 닫기 버튼으로만 닫는다.
    <div className={styles.userModalOverlay}>
      <div className={styles.userModalContent}>
        <h2 className={styles.userModalTitle} style={{ marginBottom: '8px' }}>{fileName} - 다운로드 로그</h2>
        <p style={{ margin: '0 0 20px 0', fontSize: '18px', color: '#666' }}>총 {logs.length}건</p>

        <div style={{ overflow: 'auto', maxHeight: '400px', marginBottom: '24px' }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>로드 중...</div>
          ) : (
            <table className={styles.excelTable}>
              <thead>
                <tr>
                  <th style={{ width: '60px', textAlign: 'center' }}>번호</th>
                  <th>사용자 ID</th>
                  <th>이름</th>
                  <th>사번</th>
                  <th>소속</th>
                  <th>다운로드 시간</th>
                </tr>
              </thead>
              <tbody>
                {logs.length > 0 ? (
                  logs.map((log, idx) => {
                    const date = new Date(log.downloaded_at);
                    const dateStr = date.toLocaleDateString('ko-KR').slice(0, -1);
                    const timeStr = date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    return (
                      <tr key={idx}>
                        <td style={{ width: '60px', textAlign: 'center', fontWeight: 600, color: '#666' }}>{idx + 1}</td>
                        <td>{log.downloaded_by}</td>
                        <td>{log.user_name || '-'}</td>
                        <td>{log.user_employee_id || '-'}</td>
                        <td>{log.user_department || '-'}</td>
                        <td>{dateStr} {timeStr}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: '#999' }}>다운로드 이력이 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <button className={styles.userModalCloseBtn} onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
});

export default DownloadLogsModal;
