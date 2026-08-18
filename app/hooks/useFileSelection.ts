import { useState, useCallback } from 'react';

export function useFileSelection() {
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());

  const handleSelectAll = useCallback((files: any[]) => {
    if (selectedFileIds.size === files.length) {
      setSelectedFileIds(new Set());
    } else {
      setSelectedFileIds(new Set(files.map((f: any) => f.id)));
    }
  }, [selectedFileIds.size]);

  const handleSelectFile = useCallback((fileId: string) => {
    const newSelected = new Set(selectedFileIds);
    if (newSelected.has(fileId)) {
      newSelected.delete(fileId);
    } else {
      newSelected.add(fileId);
    }
    setSelectedFileIds(newSelected);
  }, [selectedFileIds]);

  const clearSelection = () => setSelectedFileIds(new Set());

  return {
    selectedFileIds,
    setSelectedFileIds,
    handleSelectAll,
    handleSelectFile,
    clearSelection,
  };
}
