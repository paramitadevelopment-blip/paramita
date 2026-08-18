import { useState, useCallback } from 'react';
import { DeletionEvent } from '@/app/hooks/useDeletionHistory';

export function useDeletionModals() {
  const [selectedEvent, setSelectedEvent] = useState<DeletionEvent | null>(null);
  const [reasonEvent, setReasonEvent] = useState<DeletionEvent | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);

  const handleCloseModal = useCallback(() => {
    setSelectedEvent(null);
  }, []);

  const handleClosePreview = useCallback(() => {
    setPreviewFile(null);
  }, []);

  const handleCloseReason = useCallback(() => {
    setReasonEvent(null);
  }, []);

  const handleEventClick = useCallback((event: DeletionEvent) => {
    setSelectedEvent(event);
  }, []);

  const handleViewReason = useCallback((event: DeletionEvent) => {
    setReasonEvent(event);
  }, []);

  const openPreview = useCallback((file: File) => {
    setPreviewFile(file);
  }, []);

  return {
    selectedEvent,
    handleCloseModal,
    reasonEvent,
    handleCloseReason,
    previewFile,
    handleClosePreview,
    handleEventClick,
    handleViewReason,
    openPreview,
  };
}
