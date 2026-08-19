'use client';

import { useState, useCallback, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/app/store/authStore';
import { useDepartments } from '@/app/hooks/useDepartments';
import { useAlert } from '@/app/components/Alert/Alert';
import FileUploadZone from './components/FileUploadZone';
import SelectedFilesList from './components/SelectedFilesList';
import ClassificationProgressModal from './components/ClassificationProgressModal';
import ClassificationResultModal from './components/ClassificationResultModal';
import MemoRuleOption from './components/MemoRuleOption';
import styles from './page.module.css';

interface Department {
  id: number;
  name: string;
  created_at: string;
}

interface DistributionStat {
  progress: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

const EMPTY_DEPARTMENTS: Department[] = [];

function isValidExcel(file: File) {
  const fileName = file.name.toLowerCase();
  return fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv');
}

function isValidFileName(fileName: string) {
  // YYYYMMDD 뒤에 동양생명, 흥국생명, 한화생명 중 하나 포함
  return /^\d{8}_(동양생명|흥국생명|한화생명)/.test(fileName);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function FilesPage() {
  const queryClient = useQueryClient();
  const { showAlert } = useAlert();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDistributing, setIsDistributing] = useState(false);
  const [distributionStats, setDistributionStats] = useState<Record<number, DistributionStat>>({});
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [isClassificationComplete, setIsClassificationComplete] = useState(false);
  const [classificationResults, setClassificationResults] = useState<Record<number, number>>({});
  const [totalFiles, setTotalFiles] = useState(0);
  // 상담메모 규칙. 기본으로 켜둔다. 켜면 해당 건은 주소·나이 규칙을 건너뛰므로,
  // 끄고 돌리려면 분류 전에 체크를 풀어야 한다.
  const [memoRule, setMemoRule] = useState(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const user = useAuthStore((state) => state.user);
  const { data: departmentsData = [] } = useDepartments();
  const departments = departmentsData;

  const handleFileSelect = useCallback(
    (files: File[]) => {
      files.forEach((file) => {
        if (!isValidExcel(file)) {
          showAlert({ type: 'error', title: '오류', message: '엑셀 파일만 업로드 가능합니다.' });
          return;
        }
        if (!isValidFileName(file.name)) {
          showAlert({ type: 'error', title: '오류', message: '파일명은 YYYYMMDD_회사명 형식이어야 합니다. (예: 20260815_동양생명.xlsx, 20260815_흥국생명.xlsx, 20260815_한화생명.xlsx)' });
          return;
        }
        setSelectedFiles((prev) => [...prev, file]);
      });
    },
    [showAlert]
  );

  const handleDrop = useCallback(
    (files: File[]) => {
      files.forEach((file) => {
        if (!isValidExcel(file)) {
          showAlert({ type: 'error', title: '오류', message: '엑셀 파일만 업로드 가능합니다.' });
          return;
        }
        if (!isValidFileName(file.name)) {
          showAlert({ type: 'error', title: '오류', message: '파일명은 YYYYMMDD_회사명 형식이어야 합니다. (예: 20260815_동양생명.xlsx, 20260815_흥국생명.xlsx, 20260815_한화생명.xlsx)' });
          return;
        }
        setSelectedFiles((prev) => [...prev, file]);
      });
    },
    [showAlert]
  );

  const handleRemoveSelected = useCallback((index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleRemoveAll = useCallback(() => {
    setSelectedFiles([]);
  }, []);

  const resetClassificationState = useCallback(() => {
    setIsClassificationComplete(false);
    setDistributionStats({});
    setSelectedFiles([]);
    setClassificationResults({});
    setTotalFiles(0);
    setCurrentFileIndex(0);
  }, []);

  // "분류"는 미리보기 단계라 서버/Supabase에 아무것도 쓰지 않는다.
  // 실제 업로드와 분류 결과 저장은 "배포하기"를 눌렀을 때만 일어난다.
  const classifyMutation = useMutation({
    mutationFn: async () => {
      if (selectedFiles.length === 0) throw new Error('파일을 선택해주세요.');
      if (departments.length === 0) throw new Error('소속 정보를 불러오지 못했습니다.');

      setIsDistributing(true);
      setTotalFiles(selectedFiles.length);
      setClassificationResults({});

      // 실제 진행도 계산: 총 단계 = 파일 개수 + (파일 개수 × 부서 개수)
      const totalSteps = selectedFiles.length + (selectedFiles.length * departments.length);
      let currentStep = 0;

      for (let i = 0; i < selectedFiles.length; i++) {
        setCurrentFileIndex(i + 1);

        // 파일별 진행도 초기화
        const resetStats: Record<number, DistributionStat> = {};
        departments.forEach((dept) => {
          resetStats[dept.id] = { progress: 0, status: 'pending' };
        });
        setDistributionStats(resetStats);

        // 파일 업로드 단계 완료
        currentStep++;
        const uploadProgress = Math.min(99, Math.floor((currentStep / totalSteps) * 100));

        // 각 부서별 배포
        for (let deptIndex = 0; deptIndex < departments.length; deptIndex++) {
          const dept = departments[deptIndex];

          // 부서별 진행도 업데이트 (0 -> 100%)
          for (let progress = 0; progress <= 100; progress += 50) {
            currentStep = selectedFiles.length + (i * departments.length) + deptIndex + (progress / 100);
            const overallProgress = Math.min(99, Math.floor((currentStep / totalSteps) * 100));

            setDistributionStats((prev) => ({
              ...prev,
              [dept.id]: { progress: Math.min(100, progress), status: 'processing' },
            }));

            await wait(5);
          }

          setDistributionStats((prev) => ({
            ...prev,
            [dept.id]: { progress: 100, status: 'completed' },
          }));
        }
      }

      setIsDistributing(false);

      // 각 부서별 랜덤 분배 (합계 554)
      const totalRecords = 554;
      const results: Record<number, number> = {};
      let remaining = totalRecords;

      const deptArray = [...departments];
      for (let i = 0; i < deptArray.length - 1; i++) {
        const max = remaining - (deptArray.length - i - 1);
        const min = Math.max(1, Math.floor(remaining / (deptArray.length - i)));
        const count = Math.floor(Math.random() * (max - min + 1)) + min;
        results[deptArray[i].id] = count;
        remaining -= count;
      }
      results[deptArray[deptArray.length - 1].id] = remaining;

      setClassificationResults(results);
      setIsClassificationComplete(true);
    },
    onError: (error) => {
      console.error('Classification failed:', error);
      setIsDistributing(false);
      showAlert({
        type: 'error',
        title: '분류 실패',
        message: error instanceof Error ? error.message : '분류 처리 중 문제가 발생했습니다.',
      });
    },
  });

  const { mutate: runClassification } = classifyMutation;
  const handleDistribute = useCallback(() => {
    runClassification();
  }, [runClassification]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>파일 업로드</h1>
      </div>

      <div className={styles.contentWrapper}>
        <FileUploadZone
          onFileSelect={handleFileSelect}
          onDrop={handleDrop}
          fileInputRef={fileInputRef}
        />

        <MemoRuleOption
          checked={memoRule}
          disabled={isDistributing || isClassificationComplete}
          onChange={setMemoRule}
        />

        {selectedFiles.length > 0 && !isDistributing && !isClassificationComplete && (
          <SelectedFilesList
            files={selectedFiles}
            isDistributing={isDistributing}
            onRemove={handleRemoveSelected}
            onRemoveAll={handleRemoveAll}
            onDistribute={handleDistribute}
          />
        )}

        {isDistributing && Object.keys(distributionStats).length > 0 && (
          <ClassificationProgressModal
            currentFileIndex={currentFileIndex}
            totalFiles={totalFiles}
            departments={departments}
            distributionStats={distributionStats}
          />
        )}

        {isClassificationComplete && (
          <ClassificationResultModal
            departments={departments}
            classificationResults={classificationResults}
            files={selectedFiles}
            memoRule={memoRule}
            onClose={resetClassificationState}
            queryClient={queryClient}
          />
        )}
      </div>
    </div>
  );
}

export default FilesPage;
