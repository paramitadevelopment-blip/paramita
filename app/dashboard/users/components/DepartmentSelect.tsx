'use client';

import React, { memo, useCallback } from 'react';
import { MdExpandMore } from 'react-icons/md';
import { useDepartments } from '@/app/hooks/useDepartments';
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
        {departments
          .filter((dept) => dept.name !== '관리자')
          .map((dept) => (
            <option key={dept.id} value={dept.name}>
              {dept.name}
            </option>
          ))}
      </select>
      <MdExpandMore className={styles.icon} />
    </div>
  );
});

export default DepartmentSelect;
