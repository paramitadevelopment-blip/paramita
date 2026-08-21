'use client';

import React, { memo } from 'react';
import styles from '../page.module.css';

/**
 * 요청자·다운로드자 정보 모달.
 *
 * 값은 전부 기록에 복사돼 있는 것만 쓴다. users를 조회하지 않으므로
 * 계정이 지워진 사람의 기록을 눌러도 그대로 열린다.
 */
export interface RequesterInfo {
  title: string;
  username: string | null;
  name: string | null;
  employeeId: string | null;
  department: string | null;
  fileName: string;
  /** 아래에 덧붙일 항목들 (다운로드 시각, 접속 환경 등) */
  extras?: Array<{ label: string; value: string }>;
}

interface RequesterInfoModalProps {
  info: RequesterInfo | null;
  onClose: () => void;
}

function RequesterInfoModal({ info, onClose }: RequesterInfoModalProps) {
  if (!info) return null;

  const fields: Array<{ label: string; value: string }> = [
    { label: '사용자 ID', value: info.username || '-' },
    { label: '이름', value: info.name || '-' },
    { label: '사번', value: info.employeeId || '-' },
    { label: '소속', value: info.department || '-' },
    { label: '파일명', value: info.fileName },
    ...(info.extras || []),
  ];

  return (
    // 배경을 눌러도 닫히지 않는다. 실수로 닫혀 다시 찾아 들어가는 일이 없게.
    <div className={styles.userModalOverlay}>
      <div className={styles.userModalContent}>
        <h2 className={styles.userModalTitle}>{info.title}</h2>

        {fields.map((field, i) => (
          <div
            key={field.label}
            className={`${styles.userModalField} ${i === fields.length - 1 ? styles.userModalFieldLast : ''}`}
          >
            <label className={styles.userModalLabel}>{field.label}</label>
            <div className={styles.userModalValue}>{field.value}</div>
          </div>
        ))}

        <button className={styles.userModalCloseBtn} onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
}

export default memo(RequesterInfoModal);
