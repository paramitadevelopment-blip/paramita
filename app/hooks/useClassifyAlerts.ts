'use client';

import { useCallback } from 'react';
import { useAlert } from '@/app/components/Alert/Alert';
import type { ClassifyResponse } from '@/app/hooks/useAutoClassify';
import { summarizeErrors } from '@/lib/classifyErrors';

/**
 * 분류가 끝났거나 실패했을 때 띄울 알림.
 *
 * 분류 훅의 useEffect 의존성에 그대로 들어가므로 참조를 고정해야 한다.
 * 매 렌더마다 새 함수를 만들면 효과가 다시 돌아 같은 파일을 두 번 분류하게 된다.
 *
 * @param onClose 오류를 확인했을 때 모달을 닫는 동작
 */
export function useClassifyAlerts(onClose: () => void) {
  const { showAlert } = useAlert();

  const onClassified = useCallback((result: ClassifyResponse) => {
    if (result.errorCount === 0) return;

    // 건수만 알려주면 무엇을 고쳐야 할지 알 수 없다. 사유별로 묶어 몇 번째 행인지까지 보여준다.
    const detail = summarizeErrors(result.files ?? []);
    showAlert({
      type: 'warning',
      title: '오류가 있어 배포할 수 없습니다',
      message: `${result.totalRows}건 중 ${result.errorCount}개 행에 오류가 있습니다.\n\n${detail}\n\n오류를 고친 뒤 다시 올려주세요.`,
      // 오류가 있으면 어차피 배포할 수 없다. 확인을 누르면 업로드 화면으로 돌려보낸다.
      onConfirm: onClose,
    });
  }, [showAlert, onClose]);

  const onFailed = useCallback((error: unknown) => {
    showAlert({
      type: 'error',
      title: '자동 분류 실패',
      message: error instanceof Error ? error.message : '자동 분류 중 오류가 발생했습니다.',
    });
  }, [showAlert]);

  return { onClassified, onFailed };
}
