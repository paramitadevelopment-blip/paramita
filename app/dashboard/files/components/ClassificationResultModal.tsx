'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QueryClient } from '@tanstack/react-query';
import { useAuthStore, getCsrfToken } from '@/app/store/authStore';
import { useAlert } from '@/app/components/Alert/Alert';
import { useUploadFiles, useDeployFiles } from '@/app/hooks/useFileUpload';
import { useAutoClassify, type ClassifiedFile, type SelectableRegion } from '@/app/hooks/useAutoClassify';
import {
  SELECTABLE_REGIONS,
  autoDistributePending,
  type PendingEntry,
} from '@/lib/insurance';
import { MdChevronLeft, MdChevronRight, MdArrowDropDown, MdArrowDropUp } from 'react-icons/md';
import ExcelPreviewModal from '../../download/components/ExcelPreviewModal';
import FilePager from './FilePager';
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

class SessionExpiredError extends Error {}

/** 사유가 같은 행이 여러 개일 때 다 늘어놓으면 읽히지 않으므로 앞 몇 개만 짚는다. */
const MAX_ROWS_PER_REASON = 5;
/** 파일이 여러 개여도 알림 한 통에 다 담기지는 않는다. */
const MAX_REASONS = 6;

/**
 * 오류 행들을 사유별로 묶어 사람이 읽을 문장으로 만든다.
 * "3개 행에 오류" 만으로는 파일의 무엇을 고쳐야 하는지 알 수 없다.
 */
function summarizeErrors(files: ClassifiedFile[]): string {
  const lines: string[] = [];

  for (const file of files) {
    if (file.errorCount === 0) continue;

    // 사유 → 행 번호들
    const byReason = new Map<string, number[]>();
    for (const { row, reason } of file.errors) {
      const rows = byReason.get(reason) ?? [];
      rows.push(row);
      byReason.set(reason, rows);
    }

    // 파일이 하나뿐이면 파일명 줄은 군더더기다.
    if (files.length > 1) lines.push(`[${file.fileName}]`);

    for (const [reason, rows] of [...byReason].slice(0, MAX_REASONS)) {
      const shown = rows.slice(0, MAX_ROWS_PER_REASON).join(', ');
      const rest = rows.length > MAX_ROWS_PER_REASON ? ` 외 ${rows.length - MAX_ROWS_PER_REASON}건` : '';
      lines.push(`· ${reason} — ${rows.length}건 (${shown}행${rest})`);
    }

    if (byReason.size > MAX_REASONS) {
      lines.push(`· 그 밖에 ${byReason.size - MAX_REASONS}가지 사유가 더 있습니다.`);
    }
  }

  return lines.join('\n');
}

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

const ClassificationResultModal = memo(function ClassificationResultModalComponent({
  departments,
  classificationResults: initialResults,
  files,
  memoRule,
  onClose,
}: ClassificationResultModalProps) {
  const router = useRouter();
  const { showAlert } = useAlert();
  const logout = useAuthStore((state) => state.logout);

  const [classificationResults, setClassificationResults] = useState<Record<number, number>>(initialResults);
  const [autoClassifyAttempted, setAutoClassifyAttempted] = useState(false);
  const [classifiedFiles, setClassifiedFiles] = useState<ClassifiedFile[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  // 미리보기마다 열 구성이 다르므로 헤더도 같이 들고 다닌다.
  const [preview, setPreview] = useState<{ title: string; headers: string[]; rows: any[][] } | null>(null);
  // 선택 대기 행들. 각 행별로 소속을 선택한다.
  // 파일 순서 → (주문번호 → 부서명). 위치 번호로 잡으면 화면(지역별 묶음)과
  // 배포(파일 행 순서)의 순서가 달라 엉뚱한 사람이 다른 부서로 간다.
  const [regionChoices, setRegionChoices] = useState<Record<string, string[]>>({});
  const [rowPicks, setRowPicks] = useState<Record<number, Record<string, string>>>({});
  // 선택 방식 탭. 파일마다 따로 기억한다 — 한 파일에서 자동으로 채웠다고
  // 다음 파일까지 자동으로 바뀌면 확인 없이 배포될 수 있다.
  const [pickMode, setPickMode] = useState<Record<number, 'manual' | 'auto'>>({});
  // 선택 대기 표의 정렬. 'region'이거나 미리보기 열의 인덱스다.
  const [pendingSort, setPendingSort] = useState<{ by: 'region' | number; order: 'asc' | 'desc' }>({
    by: 'region',
    order: 'asc',
  });

  // 현재 보고 있는 파일의 결과
  const current: ClassifiedFile | null = classifiedFiles[currentIndex] ?? null;

  const uploadMutation = useUploadFiles();
  const deployMutation = useDeployFiles();
  const autoClassifyMutation = useAutoClassify();

  // 엑셀 파일이 있으면 자동 분류 시도
  useEffect(() => {
    if (autoClassifyAttempted || files.length === 0) return;

    setAutoClassifyAttempted(true);

    // 선택한 엑셀 파일 전부를 분류한다 (배포도 전부를 대상으로 하므로 화면 수치와 맞춰야 함)
    const excelFiles = files.filter(
      (f) => f.name.toLowerCase().endsWith('.xlsx') ||
             f.name.toLowerCase().endsWith('.xls') ||
             f.name.toLowerCase().endsWith('.csv')
    );

    if (excelFiles.length === 0) {
      // 엑셀 파일 없으면 수동 입력한 결과 사용
      return;
    }

    autoClassifyMutation.mutate({ files: excelFiles, memoRule }, {
      onSuccess: (result) => {
        setClassificationResults(result.classificationByDeptId);
        setClassifiedFiles(result.files ?? []);
        setRegionChoices(result.regionChoices ?? {});
        setRowPicks({});
        setCurrentIndex(0);
        if (result.errorCount > 0) {
          // 건수만 알려주면 무엇을 고쳐야 할지 알 수 없다. 사유별로 묶어 몇 번째 행인지까지 보여준다.
          const detail = summarizeErrors(result.files ?? []);
          showAlert({
            type: 'warning',
            title: '오류가 있어 배포할 수 없습니다',
            message: `${result.totalRows}건 중 ${result.errorCount}개 행에 오류가 있습니다.\n\n${detail}\n\n오류를 고친 뒤 다시 올려주세요.`,
            // 오류가 있으면 어차피 배포할 수 없다. 확인을 누르면 업로드 화면으로 돌려보낸다.
            onConfirm: onClose,
          });
        }
      },
      onError: (error) => {
        showAlert({
          type: 'error',
          title: '자동 분류 실패',
          message: error instanceof Error ? error.message : '자동 분류 중 오류가 발생했습니다.',
        });
        // 오류 시 수동 입력한 결과 유지
        setClassificationResults(initialResults);
      },
    });
  }, [autoClassifyAttempted, files, memoRule, autoClassifyMutation, initialResults, showAlert, onClose]);

  /**
   * 자동 배분. 규칙으로 이미 배정된 수를 이어받아, 갈 수 있는 소속 중
   * 가장 적게 받은 곳부터 채운다. 강원 건은 갈 곳이 둘뿐이라 먼저 넣는다.
   * 채워진 값은 그대로 고칠 수 있다 — 자동은 출발점일 뿐이다.
   */
  const applyAutoDistribute = (fileIdx: number) => {
    const file = classifiedFiles[fileIdx];
    if (!file) return;

    const pending: PendingEntry[] = SELECTABLE_REGIONS.flatMap((region) => {
      const keys = file.pendingKeysByRegion?.[region] ?? [];
      const jumins = file.pendingJuminByRegion?.[region] ?? [];
      return keys.map((key, i) => ({ key, region, jumin: jumins[i] ?? '' }));
    });

    // 규칙으로 이미 들어간 수. 소속ID가 아니라 이름으로 세야 배분 대상과 맞는다.
    const baseCounts: Record<string, number> = {};
    for (const [dept, count] of Object.entries(file.classification ?? {})) {
      baseCounts[dept] = count;
    }

    const picks = autoDistributePending(pending, baseCounts);
    setRowPicks((prev) => ({ ...prev, [fileIdx]: picks }));
  };

  const handlePickMode = (fileIdx: number, mode: 'manual' | 'auto') => {
    setPickMode((prev) => ({ ...prev, [fileIdx]: mode }));
    if (mode === 'auto') {
      applyAutoDistribute(fileIdx);
    } else {
      // 직접 고르는 탭으로 오면 빈 상태에서 시작한다. 자동으로 채운 값이 남아 있으면
      // 사람이 고른 것인지 자동인지 구분되지 않는다.
      setRowPicks((prev) => ({ ...prev, [fileIdx]: {} }));
    }
  };

  /**
   * 지금 고른 것까지 반영한 소속별 결과.
   * 위 그리드는 규칙이 배정한 것만 보여준다. 사람이 고른 건이 어디로 몇 건 가는지는
   * 배포하기 전에는 알 수 없어서, 고르는 도중에 실시간으로 같이 보여준다.
   */
  const resultWithPicks = useMemo(() => {
    if (!current) return null;

    // 소속명 → 선택으로 추가된 행들
    const addedRows: Record<string, any[][]> = {};

    for (const region of SELECTABLE_REGIONS) {
      const rows = current.pendingRowsByRegion?.[region] ?? [];
      const keys = current.pendingKeysByRegion?.[region] ?? [];
      keys.forEach((key, i) => {
        const dept = rowPicks[currentIndex]?.[key];
        if (!dept) return;
        (addedRows[dept] ??= []).push(rows[i]);
      });
    }

    return addedRows;
  }, [current, rowPicks, currentIndex]);

  /**
   * 좁게 눌러도 되는 열. tel1은 tel2와 같은 번호라 앞자리만 보이면 충분하다.
   * 이 열이 넓게 자리를 차지하면 정작 골라야 할 '배정 소속'이 밀려 잘린다.
   */
  const narrowCols = useMemo(() => {
    const set = new Set<number>();
    (current?.previewHeaders ?? []).forEach((header, i) => {
      if (/^tel\s*1$/i.test(String(header).trim())) set.add(i);
    });
    return set;
  }, [current]);

  const togglePendingSort = (by: 'region' | number) => {
    setPendingSort((prev) =>
      prev.by === by
        ? { by, order: prev.order === 'asc' ? 'desc' : 'asc' }
        : { by, order: 'asc' }
    );
  };

  const handlePickRow = (key: string, dept: string) => {
    setRowPicks((prev) => ({
      ...prev,
      [currentIndex]: { ...(prev[currentIndex] ?? {}), [key]: dept },
    }));
  };

  const handleDeploy = async () => {
    // 업로드가 끝난 뒤 배포가 실패하면 원본만 남는다. 되돌릴 수 있게 id를 들고 있는다.
    let uploadedIds: string[] = [];

    try {
      uploadedIds = await uploadMutation.mutateAsync(files);
      await deployMutation.mutateAsync({
        files: uploadedIds,
        classificationResults,
        // 파일 순서와 1:1로 맞춘 배열. 파일명으로 맞추면 같은 이름이 여러 개일 때 엉킨다.
        rowAssignments: classifiedFiles.map((_, i) => rowPicks[i] ?? {}),
        // 분류할 때와 같은 값을 보내야 화면에 본 결과와 실제 배포가 안 갈린다.
        memoRule,
      });
      onClose();
      showAlert({
        type: 'success',
        title: '배포 완료',
        message: '파일이 배포되었습니다.',
      });
    } catch (error) {
      // 배포가 실패했는데 원본을 남겨두면, 고쳐서 다시 올릴 때마다 쓰지도 않을
      // 원본이 쌓인다. 업로드까지 되돌려 누른 적 없는 상태로 돌려놓는다.
      await rollbackUploadedFiles(uploadedIds);

      showAlert({
        type: 'error',
        title: '배포 실패',
        message: error instanceof Error ? error.message : '배포 중 오류가 발생했습니다.',
      });
    }
  };

  const isLoading = autoClassifyMutation.isPending || uploadMutation.isPending || deployMutation.isPending;

  // 전체 오류 개수 계산
  const totalErrorCount = classifiedFiles.reduce((sum, file) => sum + file.errorCount, 0);

  // 선택 대기 행 중 아직 소속을 안 고른 것. 하나라도 남으면 배포를 막는다 —
  // 그냥 내보내면 그 건들이 아무 부서에도 안 가고 조용히 사라진다.
  // 보고 있는 파일뿐 아니라 전체 파일을 봐야 한다. 다른 페이지에 남은 건이
  // 있는데도 배포 버튼이 열리면 그 건들이 소리 없이 빠진다.
  const unpicked = classifiedFiles.flatMap((file, fileIdx) =>
    SELECTABLE_REGIONS.flatMap((region) =>
      (file.pendingKeysByRegion?.[region] ?? [])
        .filter((key) => !rowPicks[fileIdx]?.[key])
        .map(() => ({ fileName: file.fileName, region }))
    )
  );

  const canDeploy =
    totalErrorCount === 0 && classifiedFiles.length > 0 && unpicked.length === 0;

  return (
    <div className={styles.modal}>
      <div className={styles.modalContent}>
        <div className={styles.modalTitleBar}>
          <h2 className={styles.modalTitle}>
            {autoClassifyMutation.isPending ? '분류 중...' : '분류 완료'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '28px',
              cursor: 'pointer',
              color: '#999',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <div className={styles.resultContainer}>
          {autoClassifyMutation.isPending ? (
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
                <div className={styles.resultGridLeft}>
                  <button
                    className={styles.originalDataInfo}
                    style={{ cursor: current.originalRows.length > 0 ? 'pointer' : 'default', padding: '12px', textAlign: 'center', border: 'none', background: 'transparent' }}
                    onClick={() => {
                      if (current.originalRows.length === 0) return;
                      setPreview({ title: `${current.fileName} — 원본 데이터`, headers: current.previewHeaders, rows: current.originalRows });
                    }}
                  >
                    <div className={styles.resultLabel}>원본 데이터</div>
                    <div className={styles.resultCount}>{current.totalRows}건</div>
                  </button>

                  <button
                    className={styles.originalDataInfo}
                    style={{ cursor: current.processedRows.length > 0 ? 'pointer' : 'default', padding: '12px', textAlign: 'center', border: 'none', background: 'transparent' }}
                    onClick={() => {
                      if (current.processedRows.length === 0) return;
                      setPreview({ title: `${current.fileName} — 분류 결과`, headers: current.processedHeaders, rows: current.processedRows });
                    }}
                  >
                    <div className={styles.resultLabel}>분류 결과</div>
                    <div className={styles.resultCount}>{current.processedRows.length}건</div>
                  </button>

                  <button
                    className={styles.originalDataInfo}
                    style={{ cursor: current.duplicateRows.length > 0 ? 'pointer' : 'default', padding: '12px', textAlign: 'center', border: 'none', background: 'transparent' }}
                    onClick={() => {
                      if (current.duplicateRows.length === 0) return;
                      setPreview({ title: `${current.fileName} — 중복`, headers: current.duplicateHeaders, rows: current.duplicateRows });
                    }}
                  >
                    <div className={styles.resultLabel}>중복</div>
                    <div className={styles.resultCount}>{current.duplicateRows.length}건</div>
                  </button>
                </div>

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
                pickMode={pickMode[currentIndex] ?? 'manual'}
                onPickMode={handlePickMode}
                pendingSort={pendingSort}
                onToggleSort={togglePendingSort}
                narrowCols={narrowCols}
                rowPicks={rowPicks[currentIndex] ?? {}}
                onPickRow={handlePickRow}
                regionChoices={regionChoices}
              />
            </>
          ) : null}

          <div className={styles.resultActions}>
            <button
              className={styles.cancelBtn}
              onClick={onClose}
              disabled={isLoading}
            >
              취소
            </button>
            <button
              className={styles.deployBtn}
              onClick={handleDeploy}
              disabled={isLoading || !canDeploy}
              title={
                totalErrorCount > 0
                  ? `${totalErrorCount}개 행에 오류가 있어 배포할 수 없습니다.`
                  : unpicked.length > 0
                    ? `배정 부서를 안 고른 지역: ${unpicked.map((u) => u.region).join(', ')}`
                    : ''
              }
            >
              {autoClassifyMutation.isPending ? '분류 중...' : uploadMutation.isPending ? '업로드 중...' : deployMutation.isPending ? '배포 중...' : totalErrorCount > 0 ? `${totalErrorCount}개 오류 (배포 불가)` : unpicked.length > 0 ? `${unpicked.length}개 지역 배정 필요` : '배포하기'}
            </button>
          </div>
        </div>
      </div>

      {preview && current && (
        <ExcelPreviewModal
          title={preview.title}
          data={{ headers: preview.headers, rows: preview.rows }}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
});

export default ClassificationResultModal;
