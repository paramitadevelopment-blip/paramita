'use client';

import React, { useState, useCallback } from 'react';
import { usePreviewFile } from '@/app/hooks/useFileDownload';
import SearchBar from '@/app/components/SearchBar/SearchBar';
import Spinner from '@/app/components/Spinner/Spinner';
import ExcelPreviewModal from '@/app/dashboard/download/components/ExcelPreviewModal';
import OriginalFilesSection from './components/OriginalFilesSection';
import FileTransferSection from './components/FileTransferSection';
import DownloadFilesSection from './components/DownloadFilesSection';
import DownloadLogsSection from './components/DownloadLogsSection';
import DownloadRequestsSection from './components/DownloadRequestsSection';
import DeletionHistorySection from './components/DeletionHistorySection';
import BlacklistSection from './components/BlacklistSection';
import ReapplySection from './components/ReapplySection';
import styles from './page.module.css';

function SearchPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewFileName, setPreviewFileName] = useState<string>('');
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const previewMutation = usePreviewFile();

  const handlePreview = useCallback(
    (fileId: string, fileName: string) => {
      setIsLoadingPreview(true);
      previewMutation.mutate(
        { fileId, fileName },
        {
          onSuccess: (file) => {
            setPreviewFile(file);
            setPreviewFileName(fileName);
            setIsLoadingPreview(false);
          },
          onError: () => {
            setIsLoadingPreview(false);
          },
        }
      );
    },
    [previewMutation]
  );

  const formatDateTime = useCallback((dateString: string) => {
    const date = new Date(dateString);
    const dateStr = date.toLocaleDateString('ko-KR').slice(0, -1);
    const hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const period = hours >= 12 ? '오후' : '오전';
    const displayHours = String(hours % 12 || 12).padStart(2, '0');
    return `${dateStr} ${period} ${displayHours}:${minutes}`;
  }, []);

  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);

  const handleReset = useCallback(() => {
    setSearchQuery('');
  }, []);

  return (
    <>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1>검색</h1>
        </div>

        <div className={styles.contentWrapper}>
          <div className={styles.searchSection}>
            <SearchBar
              value={searchQuery}
              onChange={handleSearch}
              onReset={handleReset}
              placeholder="검색어를 입력해주세요."
            />
          </div>

          {isLoadingPreview && <Spinner />}

          {searchQuery && !isLoadingPreview && (
            <div className={styles.resultsSection}>
              <OriginalFilesSection
                searchQuery={searchQuery}
                onPreview={handlePreview}
                formatDateTime={formatDateTime}
              />
              <FileTransferSection
                searchQuery={searchQuery}
                formatDateTime={formatDateTime}
              />
              <DownloadFilesSection
                searchQuery={searchQuery}
                onPreview={handlePreview}
                formatDateTime={formatDateTime}
              />
              <DownloadLogsSection
                searchQuery={searchQuery}
                onPreview={handlePreview}
                formatDateTime={formatDateTime}
              />
              <DownloadRequestsSection
                searchQuery={searchQuery}
                onPreview={handlePreview}
                formatDateTime={formatDateTime}
              />
              <DeletionHistorySection
                searchQuery={searchQuery}
                onPreview={handlePreview}
                formatDateTime={formatDateTime}
              />
              <BlacklistSection searchQuery={searchQuery} formatDateTime={formatDateTime} />
              <ReapplySection searchQuery={searchQuery} formatDateTime={formatDateTime} />
            </div>
          )}

          {!searchQuery && (
            <div className={styles.emptyState}>
              <p>검색어를 입력해주세요.</p>
            </div>
          )}
        </div>
      </div>

      {previewFile && (
        <ExcelPreviewModal
          file={previewFile}
          onClose={() => {
            setPreviewFile(null);
            setPreviewFileName('');
          }}
        />
      )}
    </>
  );
}

export default SearchPage;
