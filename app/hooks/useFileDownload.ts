import { useMutation } from '@tanstack/react-query';
import { getCsrfToken } from '@/app/store/authStore';

export function useDownloadFile() {
  return useMutation({
    mutationFn: async ({ fileId, fileName }: { fileId: string; fileName: string }) => {
      const response = await fetch(`/api/files/download/${fileId}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('파일 다운로드에 실패했습니다.');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
  });
}

export function usePreviewFile() {
  return useMutation({
    mutationFn: async ({ fileId, fileName }: { fileId: string; fileName: string }) => {
      const response = await fetch(`/api/files/download/${fileId}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('파일을 읽을 수 없습니다.');
      }

      const blob = await response.blob();
      const file = new File([blob], fileName, { type: blob.type });
      return file;
    },
  });
}

export function useDeleteFiles() {
  return useMutation({
    mutationFn: async (data: { fileIds: string[]; deleteDistributedFiles?: boolean; reason: string }) => {
      const response = await fetch('/api/files/delete', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken(),
        },
        body: JSON.stringify({
          fileIds: data.fileIds,
          deleteDistributedFiles: data.deleteDistributedFiles !== false,
          reason: data.reason,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error || '파일 삭제에 실패했습니다.');
      }

      return response.json();
    },
  });
}
