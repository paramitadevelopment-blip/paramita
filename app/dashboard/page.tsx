'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore, getCsrfToken } from '@/app/store/authStore';
import { useDashboard } from '@/app/hooks/useDashboard';
import { usePreviewFile } from '@/app/hooks/useFileDownload';
import { useAlert } from '@/app/components/Alert/Alert';
import Spinner from '@/app/components/Spinner/Spinner';
import EmptyState from '@/app/components/EmptyState/EmptyState';
import ExcelPreviewModal from '@/app/dashboard/download/components/ExcelPreviewModal';
import Link from 'next/link';
import { MdArrowDropUp, MdArrowDropDown } from 'react-icons/md';
import styles from './page.module.css';

interface User {
  username: string;
  role: string;
}

function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const { showAlert } = useAlert();

  const previewMutation = usePreviewFile();
  const { data: dashboardData, isLoading } = useDashboard();

  // 최근 다운로드 기록 조회
  const { data: downloadHistoryData } = useQuery({
    queryKey: ['downloadHistoryRecent'],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: '1',
        limit: '5',
        sortBy: 'downloaded_at',
        sortOrder: 'desc',
      });

      const response = await fetch(`/api/download-history?${params}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken(),
        },
      });

      if (!response.ok) {
        return null;
      }

      return response.json();
    },
  });

  // 최근 업로드 파일 조회
  const { data: recentFilesData } = useQuery({
    queryKey: ['recentFiles'],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: '1',
        limit: '5',
        sortBy: 'uploaded_at',
        sortOrder: 'desc',
        showOriginal: 'true',
      });

      const response = await fetch(`/api/files/list?${params}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken(),
        },
      });

      if (!response.ok) {
        return null;
      }

      return response.json();
    },
  });

  // 최근 추가된 사용자 정렬
  const [usersSortBy, setUsersSortBy] = useState('created_at');
  const [usersSortOrder, setUsersSortOrder] = useState<'asc' | 'desc'>('desc');

  // 소속별 통계 정렬
  const [deptSortBy, setDeptSortBy] = useState('userCount');
  const [deptSortOrder, setDeptSortOrder] = useState<'asc' | 'desc'>('desc');

  // 최근 다운로드 사용자 정렬
  const [downloadSortBy, setDownloadSortBy] = useState('downloaded_at');
  const [downloadSortOrder, setDownloadSortOrder] = useState<'asc' | 'desc'>('desc');

  // 최근 업로드 파일 정렬
  const [fileSortBy, setFileSortBy] = useState('uploaded_at');
  const [fileSortOrder, setFileSortOrder] = useState<'asc' | 'desc'>('desc');

  // 파일 미리보기 모달
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 사용자 정보 모달
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);

  // 다운로드 기록 모달
  const [selectedDownloadRecord, setSelectedDownloadRecord] = useState<any>(null);
  const [isDownloadRecordModalOpen, setIsDownloadRecordModalOpen] = useState(false);

  const handleUsersSort = useCallback((field: string) => {
    if (usersSortBy === field) {
      setUsersSortOrder(usersSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setUsersSortBy(field);
      setUsersSortOrder('asc');
    }
  }, [usersSortBy, usersSortOrder]);

  const handleDeptSort = useCallback((field: string) => {
    if (deptSortBy === field) {
      setDeptSortOrder(deptSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setDeptSortBy(field);
      setDeptSortOrder('asc');
    }
  }, [deptSortBy, deptSortOrder]);

  const handleDownloadSort = useCallback((field: string) => {
    if (downloadSortBy === field) {
      setDownloadSortOrder(downloadSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setDownloadSortBy(field);
      setDownloadSortOrder('asc');
    }
  }, [downloadSortBy, downloadSortOrder]);

  const handleFileSort = useCallback((field: string) => {
    if (fileSortBy === field) {
      setFileSortOrder(fileSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setFileSortBy(field);
      setFileSortOrder('asc');
    }
  }, [fileSortBy, fileSortOrder]);

  // 정렬된 사용자 데이터
  const sortedUsers = useMemo(() => {
    if (!dashboardData?.recentUsers) return [];
    const sorted = [...dashboardData.recentUsers];
    sorted.sort((a, b) => {
      let aVal: any = a[usersSortBy as keyof typeof a];
      let bVal: any = b[usersSortBy as keyof typeof b];

      if (usersSortBy === 'created_at') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }

      if (usersSortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
    return sorted;
  }, [dashboardData?.recentUsers, usersSortBy, usersSortOrder]);

  // 정렬된 부서 데이터
  const sortedDepts = useMemo(() => {
    if (!dashboardData?.departmentStats) return [];
    const sorted = [...dashboardData.departmentStats].filter((dept) => dept.name !== '관리자');
    sorted.sort((a, b) => {
      let aVal: any = a[deptSortBy as keyof typeof a];
      let bVal: any = b[deptSortBy as keyof typeof b];

      if (deptSortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
    return sorted;
  }, [dashboardData?.departmentStats, deptSortBy, deptSortOrder]);

  // 정렬된 다운로드 기록
  const sortedDownloads = useMemo(() => {
    if (!downloadHistoryData?.records) return [];
    const sorted = [...downloadHistoryData.records];
    sorted.sort((a, b) => {
      let aVal: any = a[downloadSortBy as keyof typeof a];
      let bVal: any = b[downloadSortBy as keyof typeof b];

      if (downloadSortBy === 'downloaded_at') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }

      if (downloadSortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
    return sorted;
  }, [downloadHistoryData?.records, downloadSortBy, downloadSortOrder]);

  // 정렬된 파일 데이터
  const sortedFiles = useMemo(() => {
    if (!recentFilesData?.data) return [];
    const sorted = [...recentFilesData.data];
    sorted.sort((a, b) => {
      let aVal: any = a[fileSortBy as keyof typeof a];
      let bVal: any = b[fileSortBy as keyof typeof b];

      if (fileSortBy === 'uploaded_at') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }

      if (fileSortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
    return sorted;
  }, [recentFilesData?.data, fileSortBy, fileSortOrder]);

  // 메모이제이션: 요약 카드 데이터
  const summaryCards = useMemo(() => {
    if (!dashboardData) return null;
    const { summary } = dashboardData;
    return [
      { label: '총 사용자', value: summary.totalUsers, color: '#db1a62' },
      { label: '총 소속', value: summary.totalDepartments, color: '#4CAF50' },
      { label: '오늘 추가된 사용자', value: summary.todayUsers, color: '#2196F3' },
      { label: '업로드 파일', value: summary.uploadedFiles, color: '#FF9800' },
    ];
  }, [dashboardData]);

  return (
    <>
      <Spinner isLoading={isLoading} />
      <div className={styles.container}>
        <div className={styles.header}>
          <h1>대시보드</h1>
        </div>

        <div className={styles.contentWrapper}>
          {/* 1️⃣ 상단 요약 카드 */}
          <div className={styles.summaryCards}>
          {summaryCards?.map((card, idx) => (
            <div key={idx} className={styles.summaryCard}>
              <div className={styles.cardLabel}>{card.label}</div>
              <div className={styles.cardValue} style={{ color: card.color }}>
                {card.value}
              </div>
            </div>
          ))}
        </div>

        {/* 2️⃣ 최근 다운로드한 사용자 */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid #e0e0e0' }}>
            <h3 className={styles.statisticsTitle}>최근 다운로드한 사용자 (최근 5명)</h3>
            <Link href="/dashboard/download-history" style={{ fontSize: '22px', color: '#db1a62', textDecoration: 'none', fontWeight: 600, cursor: 'pointer' }}>
              더보기 +
            </Link>
          </div>
          {downloadHistoryData?.records && downloadHistoryData.records.length > 0 ? (
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th style={{ cursor: 'pointer' }} onClick={() => handleDownloadSort('downloaded_by')}>
                      <div className={styles.headerContent}>
                        <span>사용자명</span>
                        {downloadSortBy === 'downloaded_by' && (
                          <span className={styles.sortIcon}>
                            {downloadSortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                          </span>
                        )}
                      </div>
                    </th>
                    <th style={{ cursor: 'pointer' }} onClick={() => handleDownloadSort('file_name')}>
                      <div className={styles.headerContent}>
                        <span>파일명</span>
                        {downloadSortBy === 'file_name' && (
                          <span className={styles.sortIcon}>
                            {downloadSortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                          </span>
                        )}
                      </div>
                    </th>
                    <th style={{ cursor: 'pointer' }} onClick={() => handleDownloadSort('user_department')}>
                      <div className={styles.headerContent}>
                        <span>소속</span>
                        {downloadSortBy === 'user_department' && (
                          <span className={styles.sortIcon}>
                            {downloadSortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                          </span>
                        )}
                      </div>
                    </th>
                    <th style={{ cursor: 'pointer' }} onClick={() => handleDownloadSort('downloaded_at')}>
                      <div className={styles.headerContent}>
                        <span>다운로드 시간</span>
                        {downloadSortBy === 'downloaded_at' && (
                          <span className={styles.sortIcon}>
                            {downloadSortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                          </span>
                        )}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDownloads.map((record: any) => (
                    <tr
                      key={record.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        setSelectedDownloadRecord(record);
                        setIsDownloadRecordModalOpen(true);
                      }}
                    >
                      <td>{record.downloaded_by}</td>
                      <td
                        style={{ cursor: 'pointer', color: '#db1a62', textDecoration: 'underline' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          previewMutation.mutate(
                            { fileId: record.file_id, fileName: record.file_name },
                            {
                              onSuccess: (file) => {
                                setPreviewFile(file);
                                setIsModalOpen(true);
                              },
                              onError: () => {
                                showAlert({ type: 'error', title: '오류', message: '파일을 열 수 없습니다.' });
                              },
                            }
                          );
                        }}
                      >
                        {record.file_name}
                      </td>
                      <td>{record.user_department || '-'}</td>
                      <td>{new Date(record.downloaded_at).toLocaleDateString('ko-KR').slice(0, -1)} {new Date(record.downloaded_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState message="다운로드 이력이 없습니다." />
          )}
        </div>

        {/* 3️⃣ 소속별 통계 */}
        <div>
          <h3 className={styles.statisticsTitle} style={{ marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid #e0e0e0' }}>소속별 통계</h3>
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleDeptSort('name')}>
                    <div className={styles.headerContent}>
                      <span>소속명</span>
                      {deptSortBy === 'name' && (
                        <span className={styles.sortIcon}>
                          {deptSortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                        </span>
                      )}
                    </div>
                  </th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleDeptSort('userCount')}>
                    <div className={styles.headerContent}>
                      <span>사용자 수</span>
                      {deptSortBy === 'userCount' && (
                        <span className={styles.sortIcon}>
                          {deptSortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                        </span>
                      )}
                    </div>
                  </th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleDeptSort('fileCount')}>
                    <div className={styles.headerContent}>
                      <span>파일 수</span>
                      {deptSortBy === 'fileCount' && (
                        <span className={styles.sortIcon}>
                          {deptSortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                        </span>
                      )}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedDepts.map((dept) => (
                  <tr key={dept.id}>
                    <td>{dept.name}</td>
                    <td>{dept.userCount}명</td>
                    <td>{dept.fileCount}개</td>
                  </tr>
                ))}
                {dashboardData?.departmentStats && dashboardData.departmentStats.length > 0 && (
                  <tr className={styles.totalRow}>
                    <td style={{ fontWeight: 700 }}>합계</td>
                    <td style={{ fontWeight: 700 }}>
                      {sortedDepts.reduce((sum, dept) => sum + dept.userCount, 0)}명
                    </td>
                    <td style={{ fontWeight: 700 }}>
                      {sortedDepts.reduce((sum, dept) => sum + dept.fileCount, 0)}개
                    </td>
                  </tr>
                )}
                {!dashboardData?.departmentStats.length && (
                  <tr>
                    <td colSpan={3} style={{ textAlign: 'center', color: '#999' }}>
                      소속이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 4️⃣ 최근 활동 섹션 */}
        <div className={styles.recentActivityContainer}>
          {/* A. 최근 추가된 사용자 */}
          <div className={styles.activityCard}>
            <h3>최근 추가된 사용자 (최근 5명)</h3>
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th style={{ cursor: 'pointer' }} onClick={() => handleUsersSort('username')}>
                      <div className={styles.headerContent}>
                        <span>아이디</span>
                        {usersSortBy === 'username' && (
                          <span className={styles.sortIcon}>
                            {usersSortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                          </span>
                        )}
                      </div>
                    </th>
                    <th style={{ cursor: 'pointer' }} onClick={() => handleUsersSort('name')}>
                      <div className={styles.headerContent}>
                        <span>이름</span>
                        {usersSortBy === 'name' && (
                          <span className={styles.sortIcon}>
                            {usersSortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                          </span>
                        )}
                      </div>
                    </th>
                    <th style={{ cursor: 'pointer' }} onClick={() => handleUsersSort('department')}>
                      <div className={styles.headerContent}>
                        <span>소속</span>
                        {usersSortBy === 'department' && (
                          <span className={styles.sortIcon}>
                            {usersSortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                          </span>
                        )}
                      </div>
                    </th>
                    <th style={{ cursor: 'pointer' }} onClick={() => handleUsersSort('created_at')}>
                      <div className={styles.headerContent}>
                        <span>추가일시</span>
                        {usersSortBy === 'created_at' && (
                          <span className={styles.sortIcon}>
                            {usersSortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                          </span>
                        )}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedUsers.map((user) => (
                    <tr key={user.id} style={{ cursor: 'pointer' }} onClick={() => { setSelectedUser(user); setIsUserModalOpen(true); }}>
                      <td>{user.username}</td>
                      <td>{user.name}</td>
                      <td>{user.department || '-'}</td>
                      <td>{new Date(user.created_at).toLocaleDateString('ko-KR').slice(0, -1)}</td>
                    </tr>
                  ))}
                  {!dashboardData?.recentUsers.length && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', color: '#999' }}>
                        추가된 사용자가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* B. 최근 업로드 파일 */}
          <div className={styles.activityCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #e0e0e0', marginBottom: '16px', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '22px', fontWeight: 600, color: '#000', margin: 0, marginBottom: 0, paddingBottom: 0, border: 0 }}>최근 업로드 파일 (최근 5개)</h3>
              <Link href="/dashboard/original-files" style={{ fontSize: '22px', color: '#db1a62', textDecoration: 'none', fontWeight: 600, cursor: 'pointer' }}>
                더보기 +
              </Link>
            </div>
            {recentFilesData?.data && recentFilesData.data.length > 0 ? (
              <div className={styles.tableContainer}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th style={{ cursor: 'pointer' }} onClick={() => handleFileSort('name')}>
                        <div className={styles.headerContent}>
                          <span>파일명</span>
                          {fileSortBy === 'name' && (
                            <span className={styles.sortIcon}>
                              {fileSortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                            </span>
                          )}
                        </div>
                      </th>
                      <th style={{ cursor: 'pointer' }} onClick={() => handleFileSort('size')}>
                        <div className={styles.headerContent}>
                          <span>크기</span>
                          {fileSortBy === 'size' && (
                            <span className={styles.sortIcon}>
                              {fileSortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                            </span>
                          )}
                        </div>
                      </th>
                      <th style={{ cursor: 'pointer' }} onClick={() => handleFileSort('uploaded_at')}>
                        <div className={styles.headerContent}>
                          <span>업로드 시간</span>
                          {fileSortBy === 'uploaded_at' && (
                            <span className={styles.sortIcon}>
                              {fileSortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                            </span>
                          )}
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedFiles.map((file: any) => (
                      <tr key={file.id}>
                        <td style={{ cursor: 'pointer', color: '#db1a62', textDecoration: 'underline' }} onClick={() => {
                          previewMutation.mutate(
                            { fileId: file.id, fileName: file.name },
                            {
                              onSuccess: (previewFile) => {
                                setPreviewFile(previewFile);
                                setIsModalOpen(true);
                              },
                              onError: () => {
                                showAlert({ type: 'error', title: '오류', message: '파일을 열 수 없습니다.' });
                              },
                            }
                          );
                        }}>
                          {file.name}
                        </td>
                        <td>{(file.size / 1024 / 1024).toFixed(2)} MB</td>
                        <td>{new Date(file.uploaded_at).toLocaleDateString('ko-KR').slice(0, -1)} {new Date(file.uploaded_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState message="업로드된 파일이 없습니다." />
            )}
          </div>
        </div>
      </div>

      {isModalOpen && previewFile && (
        <ExcelPreviewModal
          file={previewFile}
          onClose={() => {
            setIsModalOpen(false);
            setPreviewFile(null);
          }}
        />
      )}

      {isUserModalOpen && selectedUser && (
        <div className={styles.userModalOverlay}>
          <div className={styles.userModalContent}>
            <h2 className={styles.userModalTitle}>사용자 정보</h2>

            <div className={styles.userModalField}>
              <label className={styles.userModalLabel}>아이디</label>
              <div className={styles.userModalValue}>{selectedUser.username}</div>
            </div>

            <div className={styles.userModalField}>
              <label className={styles.userModalLabel}>이름</label>
              <div className={styles.userModalValue}>{selectedUser.name}</div>
            </div>

            <div className={styles.userModalField}>
              <label className={styles.userModalLabel}>사번</label>
              <div className={styles.userModalValue}>{selectedUser.employee_id || '-'}</div>
            </div>

            <div className={styles.userModalField}>
              <label className={styles.userModalLabel}>소속</label>
              <div className={styles.userModalValue}>{selectedUser.department || '-'}</div>
            </div>

            <div className={styles.userModalField} style={{ marginBottom: '24px' }}>
              <label className={styles.userModalLabel}>추가일시</label>
              <div className={styles.userModalValue}>{new Date(selectedUser.created_at).toLocaleDateString('ko-KR').slice(0, -1)} {new Date(selectedUser.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
            </div>

            <button className={styles.userModalCloseBtn} onClick={() => { setIsUserModalOpen(false); setSelectedUser(null); }}>
              닫기
            </button>
          </div>
        </div>
      )}

      {isDownloadRecordModalOpen && selectedDownloadRecord && (
        <div className={styles.userModalOverlay}>
          <div className={styles.userModalContent}>
            <h2 className={styles.userModalTitle}>다운로드 기록</h2>

            <div className={styles.userModalField}>
              <label className={styles.userModalLabel}>사용자 ID</label>
              <div className={styles.userModalValue}>{selectedDownloadRecord.downloaded_by}</div>
            </div>

            <div className={styles.userModalField}>
              <label className={styles.userModalLabel}>이름</label>
              <div className={styles.userModalValue}>{selectedDownloadRecord.user_name || '-'}</div>
            </div>

            <div className={styles.userModalField}>
              <label className={styles.userModalLabel}>사번</label>
              <div className={styles.userModalValue}>{selectedDownloadRecord.user_employee_id || '-'}</div>
            </div>

            <div className={styles.userModalField}>
              <label className={styles.userModalLabel}>소속</label>
              <div className={styles.userModalValue}>{selectedDownloadRecord.user_department || '-'}</div>
            </div>

            <div className={styles.userModalField}>
              <label className={styles.userModalLabel}>파일명</label>
              <div className={styles.userModalValue}>{selectedDownloadRecord.file_name}</div>
            </div>

            <div className={styles.userModalField} style={{ marginBottom: '24px' }}>
              <label className={styles.userModalLabel}>다운로드 시간</label>
              <div className={styles.userModalValue}>{new Date(selectedDownloadRecord.downloaded_at).toLocaleDateString('ko-KR').slice(0, -1)} {new Date(selectedDownloadRecord.downloaded_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
            </div>

            <button className={styles.userModalCloseBtn} onClick={() => { setIsDownloadRecordModalOpen(false); setSelectedDownloadRecord(null); }}>
              닫기
            </button>
          </div>
        </div>
      )}
      </div>
    </>
  );
}

export default DashboardPage;
