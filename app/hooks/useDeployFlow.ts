'use client';

import { getCsrfToken } from '@/app/store/authStore';
import { useUploadFiles, useDeployFiles as useDeployMutation } from '@/app/hooks/useFileUpload';
import { buildRowAssignments } from '@/lib/pendingPicks';

/**
 * 배포가 실패했을 때 방금 올린 원본을 되돌린다.
 *
 * 삭제 API는 사유를 필수로 받는다. 안 보내면 400으로 막히는데, 여기서 조용히
 * 삼키면 되돌린 줄 알고 넘어가고 쓰지도 않을 원본만 남는다.
 */
async function rollbackUploadedFiles(fileIds: string[]) {
  if (fileIds.length === 0) return;
  try {
    const response = await fetch('/api/files/delete', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': getCsrfToken(),
      },
      body: JSON.stringify({ fileIds, reason: '배포 실패로 자동 취소' }),
    });

    if (!response.ok) {
      console.error('Rollback failed:', await response.text());
    }
  } catch (rollbackError) {
    console.error('Rollback failed:', rollbackError);
  }
}

interface UseDeployFlowOptions {
  /** 업로드 화면에서 고른 원본 파일들 */
  files: File[];
  /** 소속ID → 배정 건수 */
  classificationResults: Record<number, number>;
  /** 파일 순서 → (주문번호 → 소속명). 사람이 고른 건들 */
  rowPicks: Record<number, Record<string, string>>;
  /** 파일 개수. rowAssignments를 파일 순서와 1:1로 맞추는 데 쓴다 */
  fileCount: number;
  /** 상담메모 규칙. 분류할 때와 같은 값이어야 한다 */
  memoRule: boolean;
  /** 분류가 본 배정 규칙의 시각. 그사이 지역 설정이 바뀌었으면 배포가 막힌다 */
  rulesUpdatedAt: string | null;
  onSuccess: () => void;
  onError: (error: unknown) => void;
}

/**
 * 원본 업로드 → 배포까지를 한 동작으로 묶는다.
 *
 * 둘은 따로 떼면 안 되는 한 쌍이다. 업로드만 되고 배포가 실패하면
 * 쓰지도 않을 원본이 남는데, 되돌리는 자리가 여기밖에 없기 때문이다.
 */
export function useDeployFlow({
  files,
  classificationResults,
  rowPicks,
  fileCount,
  memoRule,
  rulesUpdatedAt,
  onSuccess,
  onError,
}: UseDeployFlowOptions) {
  const uploadMutation = useUploadFiles();
  const deployMutation = useDeployMutation();

  const deploy = async () => {
    // 업로드가 끝난 뒤 배포가 실패하면 원본만 남는다. 되돌릴 수 있게 id를 들고 있는다.
    let uploadedIds: string[] = [];

    try {
      uploadedIds = await uploadMutation.mutateAsync(files);
      await deployMutation.mutateAsync({
        files: uploadedIds,
        classificationResults,
        rowAssignments: buildRowAssignments(fileCount, rowPicks),
        // 분류할 때와 같은 값을 보내야 화면에 본 결과와 실제 배포가 안 갈린다.
        memoRule,
        rulesUpdatedAt,
      });
      onSuccess();
    } catch (error) {
      // 배포가 실패했는데 원본을 남겨두면, 고쳐서 다시 올릴 때마다 쓰지도 않을
      // 원본이 쌓인다. 업로드까지 되돌려 누른 적 없는 상태로 돌려놓는다.
      await rollbackUploadedFiles(uploadedIds);
      onError(error);
    }
  };

  return {
    deploy,
    isUploading: uploadMutation.isPending,
    isDeploying: deployMutation.isPending,
  };
}
