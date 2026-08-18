import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getCsrfToken } from '@/app/store/authStore';
import { useAlert } from '@/app/components/Alert/Alert';

export function useDownloadHistoryDelete() {
  const queryClient = useQueryClient();
  const { showAlert } = useAlert();

  const deleteMutation = useMutation({
    mutationFn: async (recordIds: number[]) => {
      const response = await fetch('/api/download-history/delete', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken(),
        },
        body: JSON.stringify({ recordIds }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '삭제에 실패했습니다.');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['downloadHistory'] });
    },
  });

  const getAllRecordsMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/download-history/all', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken(),
        },
      });

      if (!response.ok) {
        throw new Error('전체 로그 조회에 실패했습니다.');
      }

      const result = await response.json();
      return result.records.map((r: any) => r.id);
    },
  });

  return {
    deleteMutation,
    getAllRecordsMutation,
  };
}
