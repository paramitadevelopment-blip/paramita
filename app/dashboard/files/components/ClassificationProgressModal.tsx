'use client';

import { memo } from 'react';
import styles from '../page.module.css';

interface Department {
  id: number;
  name: string;
}

interface DistributionStat {
  progress: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

interface ClassificationProgressModalProps {
  currentFileIndex: number;
  totalFiles: number;
  departments: Department[];
  distributionStats: Record<number, DistributionStat>;
}

const ClassificationProgressModal = memo(function ClassificationProgressModalComponent({
  currentFileIndex,
  totalFiles,
  departments,
  distributionStats,
}: ClassificationProgressModalProps) {
  return (
    <div className={styles.modal}>
      <div className={styles.modalContent}>
        <h2 className={styles.modalTitle}>
          파일 분류 진행 중
          <span className={styles.fileProgress}>{currentFileIndex}/{totalFiles}</span>
        </h2>

        <div className={styles.departmentsList}>
          {departments.map((dept) => {
            const stats = distributionStats[dept.id] || { progress: 0, status: 'pending' };
            return (
              <div key={dept.id} className={styles.departmentItem}>
                <div className={styles.departmentName}>{dept.name}</div>
                <div className={styles.progressBar}>
                  <div className={styles.progressFill} style={{ width: `${stats.progress}%` }} />
                </div>
                <div className={styles.progressPercent}>{stats.progress}%</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

export default ClassificationProgressModal;
