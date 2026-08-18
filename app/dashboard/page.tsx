'use client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore, getCsrfToken } from '@/app/store/authStore';
import { useDashboard } from '@/app/hooks/useDashboard';
import { usePreviewFile } from '@/app/hooks/useFileDownload';
import { useModals } from '@/app/hooks/useModals';
import { useAlert } from '@/app/components/Alert/Alert';
import Spinner from '@/app/components/Spinner/Spinner';
import ExcelPreviewModal from '@/app/dashboard/download/components/ExcelPreviewModal';
import RecentDownloadsSection from './components/RecentDownloadsSection';
import DepartmentStatsSection from './components/DepartmentStatsSection';
import RecentUsersSection from './components/RecentUsersSection';
import RecentFilesSection from './components/RecentFilesSection';
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

  const {
    previewFile,
    isModalOpen,
    closePreviewModal,
    openPreviewModal,
    selectedUser,
    isUserModalOpen,
    closeUserModal,
    openUserModal,
    selectedDownloadRecord,
    isDownloadRecordModalOpen,
    closeDownloadRecordModal,
    openDownloadRecordModal,
  } = useModals();

  const handleUsersSort = useCallback((field: string) => {
    if (usersSortBy === field) {
      setUsersSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setUsersSortBy(field);
      setUsersSortOrder('asc');
    }
  }, [usersSortBy]);

  const handleDeptSort = useCallback((field: string) => {
    if (deptSortBy === field) {
      setDeptSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setDeptSortBy(field);
      setDeptSortOrder('asc');
    }
  }, [deptSortBy]);

  const handleDownloadSort = useCallback((field: string) => {
    if (downloadSortBy === field) {
      setDownloadSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setDownloadSortBy(field);
      setDownloadSortOrder('asc');
    }
  }, [downloadSortBy]);

  const handleFileSort = useCallback((field: string) => {
    if (fileSortBy === field) {
      setFileSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setFileSortBy(field);
      setFileSortOrder('asc');
    }
  }, [fileSortBy]);


  const summaryCards = dashboardData ? [
    { label: '총 사용자', value: dashboardData.summary.totalUsers, color: '#db1a62' },
    { label: '총 소속', value: dashboardData.summary.totalDepartments, color: '#4CAF50' },
    { label: '오늘 추가된 사용자', value: dashboardData.summary.todayUsers, color: '#2196F3' },
    { label: '업로드 파일', value: dashboardData.summary.uploadedFiles, color: '#FF9800' },
  ] : null;

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
          {summaryCards?.map((card) => (
            <div key={card.label} className={styles.summaryCard}>
              <div className={styles.cardLabel}>{card.label}</div>
              <div className={styles.cardValue} style={{ color: card.color }}>
                {card.value}
              </div>
            </div>
          ))}
        </div>

        {/* 2️⃣ 최근 다운로드한 사용자 */}
        <RecentDownloadsSection
          records={downloadHistoryData?.records || []}
          sortBy={downloadSortBy}
          sortOrder={downloadSortOrder}
          onSort={handleDownloadSort}
          onFileClick={(fileId, fileName) => {
            previewMutation.mutate(
              { fileId, fileName },
              {
                onSuccess: (file) => {
                  openPreviewModal(file);
                },
                onError: () => {
                  showAlert({ type: 'error', title: '오류', message: '파일을 열 수 없습니다.' });
                },
              }
            );
          }}
          onRecordClick={(record) => {
            openDownloadRecordModal(record);
          }}
        />

        {/* 3️⃣ 소속별 통계 */}
        <DepartmentStatsSection
          stats={dashboardData?.departmentStats || []}
          sortBy={deptSortBy}
          sortOrder={deptSortOrder}
          onSort={handleDeptSort}
        />

        {/* 4️⃣ 최근 활동 섹션 */}
        <div className={styles.recentActivityContainer}>
          <RecentUsersSection
            users={dashboardData?.recentUsers || []}
            sortBy={usersSortBy}
            sortOrder={usersSortOrder}
            onSort={handleUsersSort}
            onUserClick={(user) => {
              openUserModal(user);
            }}
          />

          <RecentFilesSection
            files={recentFilesData?.data || []}
            sortBy={fileSortBy}
            sortOrder={fileSortOrder}
            onSort={handleFileSort}
            onFileClick={(fileId, fileName) => {
              previewMutation.mutate(
                { fileId, fileName },
                {
                  onSuccess: (file) => {
                    openPreviewModal(file);
                  },
                  onError: () => {
                    showAlert({ type: 'error', title: '오류', message: '파일을 열 수 없습니다.' });
                  },
                }
              );
            }}
          />
        </div>
      </div>

      {isModalOpen && previewFile && (
        <ExcelPreviewModal
          file={previewFile}
          onClose={closePreviewModal}
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

            <button className={styles.userModalCloseBtn} onClick={closeUserModal}>
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

            <button className={styles.userModalCloseBtn} onClick={closeDownloadRecordModal}>
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
