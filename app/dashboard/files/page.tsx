'use client';

import { useState, useCallback, useMemo, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MdCloudUpload, MdCloudDownload } from 'react-icons/md';
import { useAuthStore } from '@/app/store/authStore';
import { useDepartments } from '@/app/hooks/useDepartments';
import { useAlert } from '@/app/components/Alert/Alert';
import { isHiddenDepartment } from '@/lib/departments';
import FileUploadZone from './components/FileUploadZone';
import TransferredFileSelect from './components/TransferredFileSelect';
import SelectedFilesList from './components/SelectedFilesList';
import ClassificationProgressModal from './components/ClassificationProgressModal';
import ClassificationResultModal from './components/ClassificationResultModal';
import MemoRuleOption from './components/MemoRuleOption';
import styles from './page.module.css';
import { isValidUploadFileName, UPLOAD_FILE_NAME_HINT } from '@/lib/insurance';

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

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function FilesPage() {
  const queryClient = useQueryClient();
  const { showAlert } = useAlert();
  const [uploadMode, setUploadMode] = useState<'local' | 'transfer'>('local');
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
  // 파일전달 탭의 체크 상태는 그 컴포넌트 안에서만 갖고 있다. 선택 목록을
  // 밖(전체 삭제·분류 완료)에서 통째로 비울 때 체크도 같이 풀리게 하려면
  // key를 바꿔 다시 마운트시키는 수밖에 없다 — 내부 상태를 직접 건드릴 방법이 없다.
  const [transferResetKey, setTransferResetKey] = useState(0);

  const user = useAuthStore((state) => state.user);
  const { data: departmentsData = [] } = useDepartments();
  // 관리자('관리자')·DB담당자('DB담당자') 소속은 원본이 들어가는 자리일 뿐
  // 배정 대상이 아니다. 걸러내지 않으면 분류 진행률·결과 화면에 빈 항목으로 뜬다.
  const departments = useMemo(
    () => departmentsData.filter((d) => !d.is_admin && !isHiddenDepartment(d.name)),
    [departmentsData]
  );

  // 클릭으로 고르든 끌어다 놓든 같은 검사를 거쳐야 한다.
  // 두 벌로 두면 한쪽만 고쳐져 동작이 갈린다.
  const addFiles = useCallback(
    (files: File[]) => {
      files.forEach((file) => {
        if (!isValidExcel(file)) {
          showAlert({ type: 'error', title: '오류', message: '엑셀 파일만 업로드 가능합니다.' });
          return;
        }
        // 규칙은 서버와 같은 함수를 쓴다. 여기서만 막으면 API로는 그대로 들어간다.
        if (!isValidUploadFileName(file.name)) {
          showAlert({ type: 'error', title: '오류', message: UPLOAD_FILE_NAME_HINT });
          return;
        }
        // 같은 파일을 여러 번 담는 건 허용한다 (같은 원본을 여러 번 배포하는 경우가 있다).
        setSelectedFiles((prev) => [...prev, file]);
      });
    },
    [showAlert]
  );

  const handleRemoveSelected = useCallback((index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // 파일전달 체크를 해제했을 때, 그 체크로 가져왔던 파일만 골라 뺀다.
  // File은 값이 아니라 참조라 방금 가져온 그 객체와 같은지로 정확히 짚을 수 있다.
  const handleRemoveTransferredFile = useCallback((file: File) => {
    setSelectedFiles((prev) => prev.filter((f) => f !== file));
  }, []);

  const handleRemoveAll = useCallback(() => {
    setSelectedFiles([]);
    setTransferResetKey((k) => k + 1);
  }, []);

  const resetClassificationState = useCallback(() => {
    setIsClassificationComplete(false);
    setDistributionStats({});
    setSelectedFiles([]);
    setClassificationResults({});
    setTotalFiles(0);
    setCurrentFileIndex(0);
    setTransferResetKey((k) => k + 1);
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
        <div className={styles.uploadModeTabs}>
          <button
            type="button"
            className={`${styles.uploadModeTab} ${uploadMode === 'local' ? styles.uploadModeTabActive : ''}`}
            onClick={() => setUploadMode('local')}
            disabled={isDistributing || isClassificationComplete}
          >
            <MdCloudUpload className={styles.uploadModeIcon} />
            <span>PC 파일 직접 업로드</span>
          </button>
          <button
            type="button"
            className={`${styles.uploadModeTab} ${uploadMode === 'transfer' ? styles.uploadModeTabActive : ''}`}
            onClick={() => setUploadMode('transfer')}
            disabled={isDistributing || isClassificationComplete}
          >
            <MdCloudDownload className={styles.uploadModeIcon} />
            <span>파일 전달에서 가져오기 (최근 5건)</span>
          </button>
        </div>

        {uploadMode === 'local' ? (
          <FileUploadZone
            onFileSelect={addFiles}
            onDrop={addFiles}
            fileInputRef={fileInputRef}
          />
        ) : (
          <TransferredFileSelect
            key={transferResetKey}
            onFileSelect={addFiles}
            onFileRemove={handleRemoveTransferredFile}
            disabled={isDistributing || isClassificationComplete}
          />
        )}

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
