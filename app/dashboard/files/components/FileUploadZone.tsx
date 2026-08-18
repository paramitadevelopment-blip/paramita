'use client';

import { memo } from 'react';
import { MdCloudUpload } from 'react-icons/md';
import styles from '../page.module.css';

interface FileUploadZoneProps {
  onFileSelect: (files: File[]) => void;
  onDrop: (files: File[]) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

const FileUploadZone = memo(function FileUploadZoneComponent({
  onFileSelect,
  onDrop,
  fileInputRef,
}: FileUploadZoneProps) {
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files);
    onDrop(files);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (files) {
      onFileSelect(Array.from(files));
    }
    // 같은 파일을 연속으로 다시 선택해도 onChange가 발생하도록 값 초기화
    e.currentTarget.value = '';
  };

  return (
    <>
      <div
        className={styles.dragDropZone}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => fileInputRef.current?.click()}
      >
        <MdCloudUpload className={styles.uploadIcon} />
        <p>엑셀 파일을 드래그 하거나 올려주세요.</p>
        <p className={styles.dragDropHint}>중복 업로드 가능합니다.</p>
      </div>

      <button className={styles.selectFileBtn} onClick={() => fileInputRef.current?.click()}>
        파일 선택
      </button>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".xlsx,.xls,.csv"
        onChange={handleInputChange}
        style={{ display: 'none' }}
      />
    </>
  );
});

export default FileUploadZone;
