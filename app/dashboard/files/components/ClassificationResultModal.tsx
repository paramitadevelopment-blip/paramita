'use client';

import { memo, useState } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { useAlert } from '@/app/components/Alert/Alert';
import { useClassifyAlerts } from '@/app/hooks/useClassifyAlerts';
import { useClassifyFiles } from '@/app/hooks/useClassifyFiles';
import { useDeployFlow } from '@/app/hooks/useDeployFlow';
import { usePendingPicks } from '@/app/hooks/usePendingPicks';
import ExcelPreviewModal from '../../download/components/ExcelPreviewModal';
import { toDuplicateBadges } from '@/lib/duplicateSummary';
import FilePager from './FilePager';
import FileSummaryButtons from './FileSummaryButtons';
import DeployActions from './DeployActions';
import DeptResultGrids from './DeptResultGrids';
import PendingAssignTable from './PendingAssignTable';
import styles from '../page.module.css';

interface Department {
  id: number;
  name: string;
  /** 원본이 들어가는 자리. 배정 대상이 아니라 결과 표에서 뺀다. */
  is_admin?: boolean;
}

interface ClassificationResultModalProps {
  departments: Department[];
  classificationResults: Record<number, number>;
  files: File[];
  /** 상담메모 규칙 (업로드 화면 체크박스). 분류와 배포가 같은 값을 써야 한다 */
  memoRule: boolean;
  onClose: () => void;
  queryClient: QueryClient;
}

/* 아직 아무 탭도 안 고른 파일에 넘길 빈 값.
   매번 {}를 새로 만들면 memo가 걸린 표가 그때마다 다시 그려진다. */
const EMPTY_PICK_MODES: Record<string, 'manual' | 'auto'> = {};

const ClassificationResultModal = memo(function ClassificationResultModalComponent({
  departments,
  classificationResults: initialResults,
  files,
  memoRule,
  onClose,
}: ClassificationResultModalProps) {
  const { showAlert } = useAlert();

  // 미리보기마다 열 구성이 다르므로 헤더도 같이 들고 다닌다.
  const [preview, setPreview] = useState<{ title: string; headers: string[]; rows: any[][] } | null>(null);

  // 오류를 어떻게 알릴지는 화면의 몫이라 분류 훅에 넘겨준다.
  const { onClassified, onFailed } = useClassifyAlerts(onClose);

  // 엑셀을 서버에 보내 분류하고 그 결과를 파일 단위로 들고 있는다.
  const {
    classificationResults,
    classifiedFiles,
    currentIndex,
    setCurrentIndex,
    rulesUpdatedAt,
    current,
    isClassifying,
  } = useClassifyFiles({
    files,
    memoRule,
    initialResults,
    onClassified,
    onFailed,
  });

  // 사람이 소속을 골라야 하는 건들. 상태와 계산이 한 덩어리라 훅으로 묶어 둔다.
  const {
    rowPicks,
    pickMode,
    pendingSort,
    regionTab,
    reasonTab,
    resultWithPicks,
    unpicked,
    handlePickMode,
    handlePickRow,
    handleRegionTab,
    handleReasonTab,
    handlePickAll,
    togglePendingSort,
  } = usePendingPicks(classifiedFiles, currentIndex);

  // 원본 업로드와 배포는 한 쌍이라 훅으로 묶었다. 배포가 실패하면 업로드도 되돌린다.
  const { deploy, isUploading, isDeploying } = useDeployFlow({
    files,
    classificationResults,
    rowPicks,
    fileCount: classifiedFiles.length,
    memoRule,
    rulesUpdatedAt,
    onSuccess: () => {
      onClose();
      showAlert({ type: 'success', title: '배포 완료', message: '파일이 배포되었습니다.' });
    },
    onError: (error) => {
      showAlert({
        type: 'error',
        title: '배포 실패',
        message: error instanceof Error ? error.message : '배포 중 오류가 발생했습니다.',
      });
    },
  });

  // 전체 오류 개수. 하나라도 있으면 배포를 막는다.
  const totalErrorCount = classifiedFiles.reduce((sum, file) => sum + file.errorCount, 0);

  return (
    <div className={styles.modal}>
      <div className={styles.modalContent}>
        <div className={styles.modalTitleBar}>
          <h2 className={styles.modalTitle}>
            {isClassifying ? '분류 중...' : '분류 완료'}
          </h2>
          <button
            type="button"
            className={styles.modalCloseBtn}
            onClick={onClose}
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <div className={styles.resultContainer}>
          {isClassifying ? (
            <div className={styles.loadingContainer}>
              <div className={styles.spinner} />
              <p>파일을 자동으로 분류 중입니다...</p>
            </div>
          ) : current ? (
            <>
              <FilePager
                fileName={current.fileName}
                currentIndex={currentIndex}
                totalFiles={classifiedFiles.length}
                onChangeIndex={setCurrentIndex}
              />

              <div className={styles.resultGrid}>
                <FileSummaryButtons current={current} onPreview={setPreview} />

                <DeptResultGrids
                  departments={departments}
                  fileName={current.fileName}
                  previewHeaders={current.previewHeaders}
                  classificationByDeptId={current.classificationByDeptId}
                  rowsByDeptId={current.rowsByDeptId}
                  addedRowsByDept={resultWithPicks}
                  onPreview={setPreview}
                />
              </div>

              <PendingAssignTable
                current={current}
                currentIndex={currentIndex}
                pickMode={pickMode[currentIndex] ?? EMPTY_PICK_MODES}
                onPickMode={handlePickMode}
                pendingSort={pendingSort}
                onToggleSort={togglePendingSort}
                rowPicks={rowPicks[currentIndex] ?? {}}
                onPickRow={handlePickRow}
                regionTab={regionTab[currentIndex] ?? 'all'}
                onRegionTab={handleRegionTab}
                reasonTab={reasonTab[currentIndex] ?? 'all'}
                onReasonTab={handleReasonTab}
                onPickAll={handlePickAll}
              />
            </>
          ) : null}

          <DeployActions
            busy={isClassifying ? '분류' : isUploading ? '업로드' : isDeploying ? '배포' : null}
            errorCount={totalErrorCount}
            unpickedRegions={unpicked.map((u) => u.region)}
            fileCount={classifiedFiles.length}
            onCancel={onClose}
            onDeploy={deploy}
          />
        </div>
      </div>

      {preview && current && (
        <ExcelPreviewModal
          title={preview.title}
          data={{ headers: preview.headers, rows: preview.rows }}
          // 중복이 갈래별로 몇 건인지 총 건수 옆에 같이 보여준다.
          // 총 건수만 있으면 왜 빠졌는지 알려면 표를 훑어야 한다.
          summary={toDuplicateBadges(current.duplicateRows)}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
});

export default ClassificationResultModal;
