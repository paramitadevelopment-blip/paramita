'use client';

import { memo } from 'react';
import styles from '../page.module.css';

interface Department {
  id: number;
  name: string;
  is_admin?: boolean;
}

interface DeptResultGridsProps {
  departments: Department[];
  fileName: string;
  previewHeaders: string[];
  classificationByDeptId: Record<number, number>;
  rowsByDeptId: Record<number, any[][]>;
  /** 소속명 → 선택으로 추가된 행들 */
  addedRowsByDept: Record<string, any[][]> | null;
  onPreview: (preview: { title: string; headers: string[]; rows: any[][] }) => void;
}

/**
 * 규칙이 배정한 결과와, 지금 고른 것까지 반영한 결과를 나란히 보여준다.
 * 두 그리드가 같은 행에 같은 소속을 두어 눈으로 바로 비교된다.
 */
const DeptResultGrids = memo(function DeptResultGridsComponent({
  departments,
  fileName,
  previewHeaders,
  classificationByDeptId,
  rowsByDeptId,
  addedRowsByDept,
  onPreview,
}: DeptResultGridsProps) {
  return (
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
                const count = classificationByDeptId[dept.id] || 0;
                const deptRows = rowsByDeptId[dept.id] ?? [];
                return (
                  <div
                    key={dept.id}
                    className={styles.resultItem}
                    style={{ cursor: deptRows.length > 0 ? 'pointer' : 'default' }}
                    onClick={() => {
                      if (deptRows.length === 0) return;
                      onPreview({ title: `${fileName} — ${dept.name}`, headers: previewHeaders, rows: deptRows });
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
                const added = addedRowsByDept?.[dept.name] ?? [];
                const ruleRows = rowsByDeptId[dept.id] ?? [];
                const finalCount = (classificationByDeptId[dept.id] || 0) + added.length;
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
                      onPreview({
                        title: `${fileName} — ${dept.name} (선택 반영)`,
                        headers: ['배정방식', ...previewHeaders],
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
  );
});

export default DeptResultGrids;
