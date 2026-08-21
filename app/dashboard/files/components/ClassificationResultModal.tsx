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
              <div className={styles.filePager}>
                <button
                  type="button"
                  className={styles.filePagerBtn}
                  onClick={() => setCurrentIndex((i) => i - 1)}
                  disabled={currentIndex === 0}
                  aria-label="이전 파일"
                >
                  <MdChevronLeft />
                </button>

                <div className={styles.filePagerInfo}>
                  <span className={styles.filePagerName} title={current.fileName}>
                    {current.fileName}
                  </span>
                  <span className={styles.filePagerCount}>
                    {currentIndex + 1}/{classifiedFiles.length}
                  </span>
                </div>

                <button
                  type="button"
                  className={styles.filePagerBtn}
                  onClick={() => setCurrentIndex((i) => i + 1)}
                  disabled={currentIndex >= classifiedFiles.length - 1}
                  aria-label="다음 파일"
                >
                  <MdChevronRight />
                </button>
              </div>

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

                <div className={styles.resultGridRight}>
                  {/* 규칙이 배정한 결과와, 지금 고른 것까지 반영한 결과를 나란히 둔다.
                      위아래로 두면 두 숫자를 번갈아 보려고 스크롤해야 한다. */}
                  <div className={styles.deptResultPair}>
                    <div className={styles.deptResultColumn}>
                      <div className={styles.deptResultTitle}>규칙 배정</div>
                      <div className={styles.departmentResults}>
                        {departments
                          .filter((dept) => !dept.is_admin)
                          .map((dept) => {
                            const count = current.classificationByDeptId[dept.id] || 0;
                            const deptRows = current.rowsByDeptId[dept.id] ?? [];
                            return (
                              <div
                                key={dept.id}
                                className={styles.resultItem}
                                style={{ cursor: deptRows.length > 0 ? 'pointer' : 'default' }}
                                onClick={() => {
                                  if (deptRows.length === 0) return;
                                  setPreview({ title: `${current.fileName} — ${dept.name}`, headers: current.previewHeaders, rows: deptRows });
                                }}
                              >
                                <div className={styles.resultDeptName}>{dept.name}</div>
                                <div className={styles.resultCountWrapper}>
                                  <span className={styles.resultCount}>{count}건</span>
                                  <span className={styles.checkMark}>✓</span>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>

                    <div className={styles.deptResultColumn}>
                      <div className={styles.deptResultTitle}>
                        선택 반영
                        <span className={styles.deptResultHint}>배포되는 최종 숫자</span>
                      </div>
                      <div className={styles.departmentResults}>
                        {departments
                          .filter((dept) => !dept.is_admin)
                          .map((dept) => {
                            const added = resultWithPicks?.[dept.name] ?? [];
                            const ruleRows = current.rowsByDeptId[dept.id] ?? [];
                            const finalCount = (current.classificationByDeptId[dept.id] || 0) + added.length;
                            // 어느 건이 규칙으로 왔고 어느 건이 사람 손을 거쳤는지 표시한다.
                            // 배포하고 나면 소속만 남아 근거를 되짚을 수 없다.
                            const finalRows = [
                              ...ruleRows.map((row: any[]) => ['자동분류', ...row]),
                              ...added.map((row: any[]) => ['직접분류', ...row]),
                            ];
                            return (
                              <div
                                key={dept.id}
                                className={styles.resultItem}
                                style={{ cursor: finalRows.length > 0 ? 'pointer' : 'default' }}
                                onClick={() => {
                                  if (finalRows.length === 0) return;
                                  setPreview({
                                    title: `${current.fileName} — ${dept.name} (선택 반영)`,
                                    headers: ['배정방식', ...current.previewHeaders],
                                    rows: finalRows,
                                  });
                                }}
                              >
                                <div className={styles.resultDeptName}>{dept.name}</div>
                                <div className={styles.resultCountWrapper}>
                                  <span className={styles.resultCount}>{finalCount}건</span>
                                  {/* 늘어난 만큼을 짚어준다. 총합만 보면 뭘 바꿨는지 안 보인다. */}
                                  {added.length > 0 && (
                                    <span className={styles.pickedDelta}>+{added.length}</span>
                                  )}
                                  <span className={styles.checkMark}>✓</span>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {Object.entries(current.pendingByRegion ?? {}).some(([, c]) => c > 0) && (
                <div
                  style={{
                    marginBottom: '16px',
                    padding: '24px 14px',
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    background: 'white',
                  }}
                >
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ fontWeight: 700, marginBottom: '8px', fontSize: '26px' }}>
                        배정할 소속을 선택해주세요
                      </div>
                      <div style={{ fontSize: '20px', color: '#666', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                        <span style={{ color: '#db1a62', fontWeight: 700 }}>
                          총 {Object.values(current.pendingByRegion ?? {}).reduce((a, b) => a + b, 0)}건
                        </span>
                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                          {Object.entries(current.pendingByRegion ?? {}).map(([region, count]) => {
                            const regionColors: Record<string, string> = {
                              '서울': '#2196F3',
                              '경기': '#4CAF50',
                              '인천': '#FF9800',
                              '강원': '#9C27B0',
                            };
                            return (
                              <span key={region} style={{ color: regionColors[region] || '#666' }}>
                                {region} : {count}건
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                  {/* 선택 방식. 자동은 같은 표에 값만 미리 채워 넣는다 — 채운 뒤에도 고칠 수 있다. */}
                  <div className={styles.pickModeTabs}>
                    {([
                      { mode: 'manual' as const, label: '직접선택' },
                      { mode: 'auto' as const, label: '자동선택' },
                    ]).map(({ mode, label }) => {
                      const active = (pickMode[currentIndex] ?? 'manual') === mode;
                      return (
                        <button
                          key={mode}
                          type="button"
                          className={`${styles.pickModeTab} ${active ? styles.pickModeTabActive : ''}`}
                          onClick={() => handlePickMode(currentIndex, mode)}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>

                  <div style={{ overflowX: 'auto', marginBottom: '12px' }}>
                    <table
                      style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        fontSize: '16px',
                        minWidth: '200px',
                        // 열이 내용대로 늘어나면 표가 화면을 넘겨 '배정 소속'이 스크롤 밖으로
                        // 나간다. 주어진 폭 안에서 열을 나눠 가져 전부 한눈에 보이게 한다.
                        tableLayout: 'fixed',
                      }}
                    >
                      <thead>
                        <tr style={{ background: '#fafafa', borderBottom: '2px solid #ddd' }}>
                          <th
                            className={styles.pendingSortableTh}
                            onClick={() => togglePendingSort('region')}
                          >
                            <span className={styles.pendingThInner}>
                              지역
                              {pendingSort.by === 'region' &&
                                (pendingSort.order === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />)}
                            </span>
                          </th>
                          {current.previewHeaders?.map((header, colIdx) => (
                            <th
                              key={header}
                              className={`${styles.pendingSortableTh} ${narrowCols.has(colIdx) ? styles.pendingNarrowCol : ''}`}
                              onClick={() => togglePendingSort(colIdx)}
                            >
                              <span className={styles.pendingThInner}>
                                {header}
                                {pendingSort.by === colIdx &&
                                  (pendingSort.order === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />)}
                              </span>
                            </th>
                          ))}
                          <th className={styles.pendingDeptTh}>배정 소속</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          // 행을 가리키는 건 화면 순서가 아니라 주문번호다.
                          // 배포는 파일 행 순서로 도는데 여긴 지역별로 묶어 보여주므로,
                          // 위치 번호로 주고받으면 선택이 다른 사람에게 붙는다.
                          const list: Array<{ key: string; region: SelectableRegion; row: any[] }> = [];
                          SELECTABLE_REGIONS.forEach((r) => {
                            const rows = current.pendingRowsByRegion?.[r] ?? [];
                            const keys = current.pendingKeysByRegion?.[r] ?? [];
                            rows.forEach((row, i) => {
                              // 키는 서버가 만들어 보낸 것을 그대로 쓴다. 여기서 다시 만들면
                              // 배포가 쓰는 키와 규칙이 갈려 선택이 엉뚱한 행에 붙는다.
                              const key = keys[i];
                              if (key === undefined) return;
                              list.push({ key, region: r, row });
                            });
                          });

                          // 정렬. 숫자로 읽히면 숫자로, 아니면 한국어 기준 문자열로 비교한다.
                          // 값이 비어 있는 행은 항상 뒤로 보낸다 — 오름/내림을 오갈 때마다
                          // 빈 칸이 맨 위로 올라오면 정작 볼 것이 가려진다.
                          const sortValue = (item: { region: SelectableRegion; row: any[] }) =>
                            pendingSort.by === 'region' ? item.region : item.row[pendingSort.by];

                          const dir = pendingSort.order === 'asc' ? 1 : -1;
                          list.sort((a, b) => {
                            const av = sortValue(a);
                            const bv = sortValue(b);
                            const aEmpty = av === null || av === undefined || av === '';
                            const bEmpty = bv === null || bv === undefined || bv === '';
                            if (aEmpty && bEmpty) return 0;
                            if (aEmpty) return 1;
                            if (bEmpty) return -1;

                            const aNum = Number(av);
                            const bNum = Number(bv);
                            if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) return (aNum - bNum) * dir;

                            return String(av).localeCompare(String(bv), 'ko-KR') * dir;
                          });

                          return list.map(({ key, region, row }) => (
                            <tr key={`${region}-${key}`} style={{ borderBottom: '1px solid #eee' }}>
                              <td style={{ padding: '10px 12px', textAlign: 'center', color: '#666', fontSize: '16px', whiteSpace: 'nowrap' }}>{region}</td>
                              {row.map((cell, i) => (
                                <td
                                  key={i}
                                  className={`${styles.pendingDataCell} ${narrowCols.has(i) ? styles.pendingNarrowCol : ''}`}
                                  title={String(cell ?? '')}
                                >
                                  {cell ?? '-'}
                                </td>
                              ))}
                              <td style={{ padding: '10px 12px' }}>
                                <div style={{ position: 'relative' }}>
                                  <select
                                    className={styles.regionSelect}
                                    required
                                    value={rowPicks[currentIndex]?.[key] ?? ''}
                                    onChange={(e) =>
                                      setRowPicks((prev) => ({
                                        ...prev,
                                        [currentIndex]: {
                                          ...(prev[currentIndex] ?? {}),
                                          [key]: e.target.value,
                                        },
                                      }))
                                    }
                                  >
                                    <option value="" hidden disabled>
                                      소속 선택
                                    </option>
                                    {(regionChoices[region] ?? []).map((dept) => (
                                      <option key={dept} value={dept}>
                                        {dept}
                                      </option>
                                    ))}
                                  </select>
                                  <MdArrowDropDown
                                    style={{
                                      position: 'absolute',
                                      right: '6px',
                                      top: '50%',
                                      transform: 'translateY(-50%)',
                                      pointerEvents: 'none',
                                      fontSize: '16px',
                                      color: '#666',
                                    }}
                                  />
                                </div>
                              </td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
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
