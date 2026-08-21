import { useMutation } from '@tanstack/react-query';
import { getCsrfToken } from '@/app/store/authStore';

export type SelectableRegion = '서울' | '경기' | '인천' | '강원';

export interface ClassifiedFile {
  fileName: string;
  /** 상품명으로 가린 보험사 */
  insurerType: 'hk' | 'dy';
  /** 사람이 부서를 골라야 하는 지역별 건수 */
  pendingByRegion: Record<SelectableRegion, number>;
  /** 지역별 대기 건의 행 (미리보기용) */
  pendingRowsByRegion: Record<SelectableRegion, any[][]>;
  /** 지역별 대기 건의 주문번호. pendingRowsByRegion과 같은 순서 */
  pendingKeysByRegion: Record<SelectableRegion, string[]>;
  /** 자동 배분이 생년월일 순으로 나누기 위해 쓰는 값. 키와 같은 순서다. */
  pendingJuminByRegion: Record<SelectableRegion, string[]>;
  /** 중복 제거 전 원본 행 수 */
  totalRows: number;
  /** 중복으로 제외된 행 수 (주문번호 기준 + 고객 기준) */
  dupRemovedCount: number;
  classification: Record<string, number>;
  classificationByDeptId: Record<number, number>;
  errors: Array<{ row: number; reason: string }>;
  errorCount: number;
  previewHeaders: string[];
  /** 분류 결과 시트의 헤더 (번호 · 배정소속 + 원본 열) */
  processedHeaders: string[];
  /** 중복 시트의 헤더 (중복사유 + 원본 열) */
  duplicateHeaders: string[];
  rowsByDeptId: Record<number, any[][]>;
  originalRows: any[][];
  /** 분류 결과 시트 (번호, 배정소속, ...) */
  processedRows: any[][];
  /** 중복 시트 (중복사유, ...) */
  duplicateRows: any[][];
}

interface ClassifyResponse {
  success: boolean;
  /** 지역별 고를 수 있는 부서 (서버가 정한 목록) */
  regionChoices: Record<SelectableRegion, string[]>;
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
    mutationFn: async ({
      files,
      memoRule,
    }: {
      files: File[];
      /** 상담메모 규칙 (업로드 화면 체크박스) */
      memoRule: boolean;
    }): Promise<ClassifyResponse> => {
      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));
      formData.append('memoRule', String(memoRule));

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
