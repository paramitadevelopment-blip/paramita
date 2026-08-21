'use client';

import React, { memo, useCallback, useMemo } from 'react';
import { MdExpandMore } from 'react-icons/md';
import { useDepartments } from '@/app/hooks/useDepartments';
import { toAssignableDepartmentGroups } from '@/lib/departments';
import styles from './DepartmentSelect.module.css';

interface DepartmentSelectProps {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}

const DepartmentSelect = memo(function DepartmentSelect({
  value,
  onChange,
  required = false,
}: DepartmentSelectProps) {
  const { data: departments = [], isLoading } = useDepartments();

  const departmentGroups = useMemo(
    () => toAssignableDepartmentGroups(departments),
    [departments]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  return (
    <div className={styles.selectWrapper}>
      <select
        value={value}
        onChange={handleChange}
        disabled={isLoading}
        className={styles.select}
      >
        <option value="" disabled hidden>소속을 선택해주세요</option>
        {/* 사람이 속하는 건 조직('파라인슈')이지 배정 분류('파라인슈1')가 아니다.
            분류를 고르면 그 사용자는 파일이 하나도 안 보이게 되므로 아예 내놓지 않는다. */}
        {departmentGroups.map((group) => (
          <option key={group} value={group}>
            {group}
          </option>
        ))}
      </select>
      <MdExpandMore className={styles.icon} />
    </div>
  );
});

export default DepartmentSelect;
