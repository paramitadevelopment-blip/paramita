import { useMutation } from '@tanstack/react-query';
import { getCsrfToken } from '@/app/store/authStore';

export interface ClassifiedFile {
  fileName: string;
  /** 중복 제거 전 원본 행 수 */
  totalRows: number;
  /** 주문번호 중복으로 제외된 행 수 */
  dupRemovedCount: number;
  classification: Record<string, number>;
  classificationByDeptId: Record<number, number>;
  errors: Array<{ row: number; reason: string }>;
  errorCount: number;
  previewHeaders: string[];
  rowsByDeptId: Record<number, any[][]>;
  originalRows: any[][];
}

interface ClassifyResponse {
  success: boolean;
  fileCount: number;
  /** 파일별 분류 결과 (1/N 페이지로 표시) */
  files: ClassifiedFile[];
  /** 전체 합산 (배포 요청 전달용) */
  totalRows: number;
  classification: Record<string, number>;
  classificationByDeptId: Record<number, number>;
  errorCount: number;
  dupRemovedCount: number;
}

export function useAutoClassify() {
  return useMutation({
    mutationFn: async (files: File[]): Promise<ClassifyResponse> => {
      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));

      const response = await fetch('/api/files/classify', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'X-CSRF-Token': getCsrfToken(),
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '파일 분류에 실패했습니다.');
      }

      return response.json();
    },
  });
}
