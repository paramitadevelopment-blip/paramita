'use client';

import { useEffect, useState } from 'react';
import {
  useAutoClassify,
  type ClassifiedFile,
  type ClassifyResponse,
} from '@/app/hooks/useAutoClassify';
import { isClassifiableFileName } from '@/lib/deployGate';

interface UseClassifyFilesOptions {
  /** 업로드 화면에서 고른 파일들 */
  files: File[];
  /** 상담메모 규칙. 분류와 배포가 같은 값을 써야 한다 */
  memoRule: boolean;
  /** 분류가 실패했을 때 되돌릴 값 (화면에서 수동으로 넣은 결과) */
  initialResults: Record<number, number>;
  /** 분류가 끝났을 때. 오류를 어떻게 알릴지는 화면의 몫이라 넘겨받는다 */
  onClassified: (result: ClassifyResponse) => void;
  onFailed: (error: unknown) => void;
}

/**
 * 고른 엑셀을 서버에 보내 분류하고, 그 결과를 파일 단위로 들고 있는다.
 *
 * 분류는 화면이 열릴 때 한 번만 돈다. 두 번 돌면 같은 파일을 두 번 읽어
 * 서버 부담만 늘고, 그 사이 사람이 고른 선택이 날아간다.
 *
 * 콜백 두 개는 의존성 배열에 들어가므로 부르는 쪽에서 useCallback으로 고정해야 한다.
 */
export function useClassifyFiles({
  files,
  memoRule,
  initialResults,
  onClassified,
  onFailed,
}: UseClassifyFilesOptions) {
  const [classificationResults, setClassificationResults] =
    useState<Record<number, number>>(initialResults);
  const [attempted, setAttempted] = useState(false);
  const [classifiedFiles, setClassifiedFiles] = useState<ClassifiedFile[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  /** 지역별로 고를 수 있는 소속. 서버가 분류하면서 같이 알려준다. */
  const [regionChoices, setRegionChoices] = useState<Record<string, string[]>>({});

  const autoClassifyMutation = useAutoClassify();

  useEffect(() => {
    if (attempted || files.length === 0) return;

    setAttempted(true);

    // 선택한 엑셀 파일 전부를 분류한다 (배포도 전부를 대상으로 하므로 화면 수치와 맞춰야 함)
    const excelFiles = files.filter((f) => isClassifiableFileName(f.name));

    if (excelFiles.length === 0) {
      // 엑셀 파일 없으면 수동 입력한 결과 사용
      return;
    }

    autoClassifyMutation.mutate({ files: excelFiles, memoRule }, {
      onSuccess: (result) => {
        setClassificationResults(result.classificationByDeptId);
        setClassifiedFiles(result.files ?? []);
        setRegionChoices(result.regionChoices ?? {});
        setCurrentIndex(0);
        onClassified(result);
      },
      onError: (error) => {
        // 오류 시 수동 입력한 결과 유지
        setClassificationResults(initialResults);
        onFailed(error);
      },
    });
  }, [attempted, files, memoRule, autoClassifyMutation, initialResults, onClassified, onFailed]);

  return {
    classificationResults,
    classifiedFiles,
    currentIndex,
    setCurrentIndex,
    regionChoices,
    /** 현재 보고 있는 파일의 결과 */
    current: (classifiedFiles[currentIndex] ?? null) as ClassifiedFile | null,
    isClassifying: autoClassifyMutation.isPending,
  };
}
