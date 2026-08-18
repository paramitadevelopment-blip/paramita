'use client';

import React, { useState, useCallback, useMemo, memo } from 'react';
import {
  useDeletionHistory,
  useRestoreFiles,
  usePreviewDeletedFile,
  DeletionEvent,
  DeletedFile,
} from '@/app/hooks/useDeletionHistory';
import ExcelPreviewModal from '@/app/dashboard/download/components/ExcelPreviewModal';
import SearchBar from '@/app/components/SearchBar/SearchBar';
import { useAlert } from '@/app/components/Alert/Alert';
import Spinner from '@/app/components/Spinner/Spinner';
import Pagination from '@/app/components/Pagination/Pagination';
import EmptyState from '@/app/components/EmptyState/EmptyState';
import DeletionHistoryTable from '../components/DeletionHistoryTable';
import DeletedFileGroup from '../components/DeletedFileGroup';
import styles from '../page.module.css';

function formatDateTime(value: string) {
  const date = new Date(value);
  const dateStr = date.toLocaleDateString('ko-KR').slice(0, -1);
  const timeStr = date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  return `${dateStr} ${timeStr}`;
}

function countOriginals(event: DeletionEvent) {
  return event.files.filter((f) => f.is_original).length;
}

const DeletionHistorySection = memo(function DeletionHistorySectionComponent() {
  const { showAlert } = useAlert();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [sortBy, setSortBy] = useState('deleted_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedEvent, setSelectedEvent] = useState<DeletionEvent | null>(null);
  const [reasonEvent, setReasonEvent] = useState<DeletionEvent | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [previewFile, setPreviewFile] = useState<File | null>(null);

  const { data, isLoading, error } = useDeletionHistory(page, limit, searchQuery);
  const { mutate: restore, isPending: isRestoring } = useRestoreFiles();
  const { mutate: preview, isPending: isPreviewing } = usePreviewDeletedFile();

  // 번호는 정렬과 무관하게 고정한다. API가 최신순으로 주므로 가장 오래된 삭제가 1번이다.
  const seqById = useMemo(() => {
    const map = new Map<number, number>();
    const total = data?.pagination?.total || 0;
    const offset = (page - 1) * limit;

    (data?.events || []).forEach((event, index) => {
      map.set(event.id, total - offset - index);
    });

    return map;
  }, [data?.events, data?.pagination?.total, page, limit]);

  const sortedEvents = useMemo(() => {
    const events = [...(data?.events || [])];
    const dir = sortOrder === 'asc' ? 1 : -1;

    return events.sort((a, b) => {
      if (sortBy === 'original_count') {
        return (countOriginals(a) - countOriginals(b)) * dir;
      }
      if (sortBy === 'distributed_count') {
        const aCount = a.files.length - countOriginals(a);
        const bCount = b.files.length - countOriginals(b);
        return (aCount - bCount) * dir;
      }
      if (sortBy === 'deleted_by') {
        return a.deleted_by.localeCompare(b.deleted_by) * dir;
      }
      return (new Date(a.deleted_at).getTime() - new Date(b.deleted_at).getTime()) * dir;
    });
  }, [data?.events, sortBy, sortOrder]);

  const handleSort = useCallback((column: string) => {
    setSortBy((prevSortBy) => {
      if (prevSortBy === column) {
        setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortOrder('asc');
      }
      return column;
    });
  }, []);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleEventClick = useCallback((event: DeletionEvent) => {
    setSelectedEvent(event);
  }, []);

  const handleRestore = useCallback(
    (event: DeletionEvent) => {
      // 이미 복구된 파일은 기록으로만 남으므로 복구 대상에서 뺀다.
      const pending = event.files.filter((f) => !f.restored_at);
      const originalCount = pending.filter((f) => f.is_original).length;
      const distributedCount = pending.length - originalCount;

      showAlert({
        type: 'warning',
        title: '파일 복구',
        message: (
          <>
            원본 <span style={{ color: '#db1a62', fontWeight: 600 }}>{originalCount}건</span>, 배포{' '}
            <span style={{ color: '#db1a62', fontWeight: 600 }}>{distributedCount}건</span>을 복구하시겠습니까?
          </>
        ),
        showCancelButton: true,
        onConfirm: () => {
          restore(
            { eventId: event.id },
            {
              onSuccess: (result) => {
                showAlert({
                  type: 'success',
                  title: '완료',
                  message: `${result.restoredCount}건의 파일이 복구되었습니다.`,
                });
              },
              onError: (err: any) => {
                showAlert({
                  type: 'error',
                  title: '오류',
                  message: err.message || '복구 중 오류가 발생했습니다.',
                });
              },
            }
          );
        },
      });
    },
    [restore, showAlert]
  );

  const handleCloseModal = useCallback(() => {
    setSelectedEvent(null);
  }, []);

  const handleFileClick = useCallback(
    (file: DeletedFile) => {
      preview(
        { fileId: file.id, fileName: file.name },
        {
          onSuccess: (loaded) => setPreviewFile(loaded),
          onError: (err: Error) => {
            showAlert({ type: 'error', title: '오류', message: err.message });
          },
        }
      );
    },
    [preview, showAlert]
  );

  const handleClosePreview = useCallback(() => {
    setPreviewFile(null);
  }, []);

  const handleViewReason = useCallback((event: DeletionEvent) => {
    setReasonEvent(event);
  }, []);

  const handleCloseReason = useCallback(() => {
    setReasonEvent(null);
  }, []);

  const modalGroups = useMemo(() => {
    const files = selectedEvent?.files || [];
    return {
      original: files.filter((f) => f.is_original),
      distributed: files.filter((f) => !f.is_original),
    };
  }, [selectedEvent]);

  return (
    <>
      <Spinner isLoading={isLoading || isRestoring || isPreviewing} />

      <div className={styles.searchSection}>
        <div className={styles.totalCount}>
          총 <span>{data?.pagination?.total || 0}</span>건
        </div>
        <SearchBar
          value={searchQuery}
          onChange={(value) => {
            setSearchQuery(value);
            setPage(1);
          }}
          onReset={() => {
            setSearchQuery('');
            setPage(1);
          }}
          placeholder="검색어를 입력해주세요."
        />
      </div>

      <div className={styles.controlsSection}>
        <select
          className={styles.select}
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          <option value="deleted_at">삭제 시간순</option>
          <option value="deleted_by">삭제한 사용자순</option>
          <option value="original_count">원본 파일 수순</option>
          <option value="distributed_count">배포 파일 수순</option>
        </select>

        <select
          className={styles.select}
          value={limit}
          onChange={(e) => {
            setLimit(parseInt(e.target.value));
            setPage(1);
          }}
        >
          <option value="10">10개씩보기</option>
          <option value="20">20개씩보기</option>
          <option value="30">30개씩보기</option>
          <option value="50">50개씩보기</option>
        </select>
      </div>

      {error ? (
        <EmptyState message="삭제 히스토리를 불러올 수 없습니다." />
      ) : sortedEvents.length === 0 ? (
        <EmptyState message="삭제된 파일이 없습니다." />
      ) : (
        <DeletionHistoryTable
          events={sortedEvents}
          seqById={seqById}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={handleSort}
          onEventClick={handleEventClick}
          onViewReason={handleViewReason}
          onRestore={handleRestore}
          isRestoring={isRestoring}
        />
      )}

      <Pagination
        currentPage={page}
        totalPages={data?.pagination?.totalPages || 1}
        onPageChange={handlePageChange}
        isLoading={isLoading}
      />

      {selectedEvent && (
        <div className={styles.userModalOverlay}>
          <div className={styles.userModalContent}>
            <h2 className={styles.userModalTitle}>삭제된 파일</h2>

            <div className={styles.userModalField}>
              <label className={styles.userModalLabel}>삭제 시간</label>
              <div className={styles.userModalValue}>
                {formatDateTime(selectedEvent.deleted_at)}
              </div>
            </div>

            <div className={styles.userModalField}>
              <label className={styles.userModalLabel}>삭제한 사용자</label>
              <div className={styles.userModalValue}>{selectedEvent.deleted_by}</div>
            </div>


            <div className={styles.userModalField} style={{ marginBottom: '24px' }}>
              <label className={styles.userModalLabel}>파일 목록</label>
              <div className={styles.userModalValue}>
                <DeletedFileGroup
                  label="원본"
                  variant="original"
                  files={modalGroups.original}
                  onFileClick={handleFileClick}
                />
                <DeletedFileGroup
                  label="배포"
                  variant="distributed"
                  files={modalGroups.distributed}
                  onFileClick={handleFileClick}
                />
              </div>
            </div>

            <button className={styles.userModalCloseBtn} onClick={handleCloseModal}>
              닫기
            </button>
          </div>
        </div>
      )}

      {reasonEvent && (
        <div className={styles.userModalOverlay}>
          <div className={styles.userModalContent}>
            <h2 className={styles.userModalTitle}>삭제 사유</h2>

            <div className={styles.userModalField}>
              <label className={styles.userModalLabel}>삭제 시간</label>
              <div className={styles.userModalValue}>
                {formatDateTime(reasonEvent.deleted_at)}
              </div>
            </div>

            <div className={styles.userModalField}>
              <label className={styles.userModalLabel}>삭제한 사용자</label>
              <div className={styles.userModalValue}>{reasonEvent.deleted_by}</div>
            </div>

            <div className={styles.userModalField} style={{ marginBottom: '24px' }}>
              <label className={styles.userModalLabel}>사유</label>
              <div className={styles.userModalValue} style={{ whiteSpace: 'pre-wrap' }}>
                {reasonEvent.reason}
              </div>
            </div>

            <button className={styles.userModalCloseBtn} onClick={handleCloseReason}>
              닫기
            </button>
          </div>
        </div>
      )}

      {previewFile && <ExcelPreviewModal file={previewFile} onClose={handleClosePreview} />}
    </>
  );
});

export default DeletionHistorySection;
