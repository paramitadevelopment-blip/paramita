'use client';

import { memo, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QueryClient } from '@tanstack/react-query';
import { useAuthStore, getCsrfToken } from '@/app/store/authStore';
import { useAlert } from '@/app/components/Alert/Alert';
import { useUploadFiles, useDeployFiles } from '@/app/hooks/useFileUpload';
import { useAutoClassify, type ClassifiedFile, type SelectableRegion } from '@/app/hooks/useAutoClassify';
import { SELECTABLE_REGIONS } from '@/lib/insurance';
import { MdChevronLeft, MdChevronRight, MdArrowDropDown } from 'react-icons/md';
import ExcelPreviewModal from '../../download/components/ExcelPreviewModal';
import styles from '../page.module.css';

interface Department {
  id: number;
  name: string;
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

async function rollbackUploadedFiles(fileIds: string[]) {
  if (fileIds.length === 0) return;
  try {
    await fetch('/api/files/delete', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': getCsrfToken(),
      },
      body: JSON.stringify({ fileIds }),
    });
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
          showAlert({
            type: 'warning',
            title: '분류 완료',
            message: `${result.totalRows}건 중 ${result.errorCount}개 행에 오류가 있습니다.`,
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
  }, [autoClassifyAttempted, files, memoRule, autoClassifyMutation, initialResults, showAlert]);

  const handleDeploy = async () => {
    try {
      const uploadedIds = await uploadMutation.mutateAsync(files);
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

                <div className={styles.resultGridRight + ' ' + styles.departmentResults}>
                  {departments
                    .filter((dept) => dept.name !== '관리자')
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

                  <div style={{ overflowX: 'auto', marginBottom: '12px' }}>
                    <table
                      style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        fontSize: '16px',
                        minWidth: '200px',
                        tableLayout: 'fixed',
                      }}
                    >
                      <thead>
                        <tr style={{ background: '#fafafa', borderBottom: '2px solid #ddd' }}>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, fontSize: '16px', whiteSpace: 'nowrap' }}>지역</th>
                          {current.previewHeaders?.map((header) => (
                            <th
                              key={header}
                              style={{
                                padding: '12px',
                                textAlign: 'left',
                                fontWeight: 600,
                                fontSize: '16px',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {header}
                            </th>
                          ))}
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, fontSize: '16px', whiteSpace: 'nowrap', width: '320px' }}>배정 소속</th>
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
                              list.push({ key: keys[i] ?? '', region: r, row });
                            });
                          });
                          return list.map(({ key, region, row }) => (
                            <tr key={`${region}-${key}`} style={{ borderBottom: '1px solid #eee' }}>
                              <td style={{ padding: '10px 12px', textAlign: 'center', color: '#666', fontSize: '16px', whiteSpace: 'nowrap' }}>{region}</td>
                              {row.map((cell, i) => (
                                <td
                                  key={i}
                                  style={{
                                    padding: '10px 12px',
                                    color: '#666',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    fontSize: '16px',
                                  }}
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
