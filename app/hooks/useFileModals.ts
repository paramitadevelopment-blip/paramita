import { useState } from 'react';

export function useFileModals() {
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteModalData, setDeleteModalData] = useState<{
    fileIds: string[];
    fileNames: string[];
    hasOriginal: boolean;
    originalFileIds: string[];
  } | null>(null);
  const [selectedDistributedFileIds, setSelectedDistributedFileIds] = useState<Set<string>>(new Set());
  const [deleteReason, setDeleteReason] = useState('');
  const [downloadLogsModalOpen, setDownloadLogsModalOpen] = useState(false);
  const [selectedFileForLogs, setSelectedFileForLogs] = useState<{ id: string; name: string } | null>(null);
  const [allDeleteModalOpen, setAllDeleteModalOpen] = useState(false);
  const [allDeleteCode, setAllDeleteCode] = useState('');
  const [allDeleteVerification, setAllDeleteVerification] = useState('');
  const [allDeleteWithDistributed, setAllDeleteWithDistributed] = useState(true);
  const [allDeleteReason, setAllDeleteReason] = useState('');

  const closePreview = () => setPreviewFile(null);
  const closeDeleteModal = () => {
    setDeleteModalOpen(false);
    setDeleteModalData(null);
    setSelectedDistributedFileIds(new Set());
    setDeleteReason('');
  };
  const closeDownloadLogsModal = () => {
    setDownloadLogsModalOpen(false);
    setSelectedFileForLogs(null);
  };
  const closeAllDeleteModal = () => setAllDeleteModalOpen(false);

  return {
    previewFile,
    setPreviewFile,
    closePreview,
    deleteModalOpen,
    setDeleteModalOpen,
    deleteModalData,
    setDeleteModalData,
    selectedDistributedFileIds,
    setSelectedDistributedFileIds,
    deleteReason,
    setDeleteReason,
    closeDeleteModal,
    downloadLogsModalOpen,
    setDownloadLogsModalOpen,
    selectedFileForLogs,
    setSelectedFileForLogs,
    closeDownloadLogsModal,
    allDeleteModalOpen,
    setAllDeleteModalOpen,
    allDeleteCode,
    setAllDeleteCode,
    allDeleteVerification,
    setAllDeleteVerification,
    allDeleteWithDistributed,
    setAllDeleteWithDistributed,
    allDeleteReason,
    setAllDeleteReason,
    closeAllDeleteModal,
  };
}
