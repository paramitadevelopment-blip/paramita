import { useState, useCallback } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useModals() {
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [selectedDownloadRecord, setSelectedDownloadRecord] = useState<any>(null);
  const [isDownloadRecordModalOpen, setIsDownloadRecordModalOpen] = useState(false);

  const closePreviewModal = useCallback(() => {
    setPreviewFile(null);
    setIsModalOpen(false);
  }, []);

  const openPreviewModal = useCallback((file: File) => {
    setPreviewFile(file);
    setIsModalOpen(true);
  }, []);

  const closeUserModal = useCallback(() => {
    setSelectedUser(null);
    setIsUserModalOpen(false);
  }, []);

  const openUserModal = useCallback((user: any) => {
    setSelectedUser(user);
    setIsUserModalOpen(true);
  }, []);

  const closeDownloadRecordModal = useCallback(() => {
    setSelectedDownloadRecord(null);
    setIsDownloadRecordModalOpen(false);
  }, []);

  const openDownloadRecordModal = useCallback((record: any) => {
    setSelectedDownloadRecord(record);
    setIsDownloadRecordModalOpen(true);
  }, []);

  return {
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
  };
}
