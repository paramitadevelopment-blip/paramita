'use client';

import React, { useState, useCallback, useEffect, useMemo, memo } from 'react';
import { MdExpandMore } from 'react-icons/md';
import { useCheckUsername } from '@/app/hooks/useCheckUsername';
import { useCheckEmployeeId } from '@/app/hooks/useCheckEmployeeId';
import { useAlert } from '@/app/components/Alert/Alert';
import { UserForm as UserFormType } from '../types';
import { STAFF_DEPARTMENT, ADMIN_DEPARTMENT } from '@/lib/departments';
import DepartmentSelect from './DepartmentSelect';
import styles from './UserForm.module.css';

interface UserFormProps {
  initialData?: UserFormType;
  onSubmit: (data: UserFormType) => Promise<void>;
  isLoading: boolean;
  onCancel: () => void;
}

const UserForm = memo(function UserForm({
  initialData,
  onSubmit,
  isLoading,
  onCancel,
}: UserFormProps) {
  const { showAlert } = useAlert();
  const isEditMode = !!initialData?.id;

  const [formData, setFormData] = useState<UserFormType>(
    initialData || {
      username: '',
      password: '',
      name: '',
      department: '',
      role: 'user',
      employee_id: '',
    }
  );

  // 디바운싱된 username, employee_id (300ms)
  const [debouncedUsername, setDebouncedUsername] = useState('');
  const [debouncedEmployeeId, setDebouncedEmployeeId] = useState('');

  // 디바운싱 로직
  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.username.trim().length >= 3) {
        setDebouncedUsername(formData.username.trim());
      } else {
        setDebouncedUsername('');
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [formData.username]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.employee_id?.trim()) {
        setDebouncedEmployeeId(formData.employee_id.trim());
      } else {
        setDebouncedEmployeeId('');
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [formData.employee_id]);

  // 아이디 중복 체크
  const { data: usernameCheckResult, isLoading: isCheckingUsername } = useCheckUsername(
    debouncedUsername,
    !isEditMode
  );

  // 사번 중복 체크
  const { data: employeeIdCheckResult, isLoading: isCheckingEmployeeId } = useCheckEmployeeId(
    debouncedEmployeeId,
    isEditMode ? formData.id : undefined,
    true
  );

  useEffect(() => {
    if (initialData) {
      setFormData({
        ...initialData,
        department: initialData.department || '',
        name: initialData.name || '',
      });
    }
  }, [initialData]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { name, value } = e.target;
      // 아이디는 서버와 동일하게 영문/숫자/언더스코어만 허용하므로 입력 단계에서 걸러낸다.
      const nextValue =
        name === 'username' ? value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 10) : value;

      setFormData((prev) => ({
        ...prev,
        [name]: nextValue,
      }));
    },
    []
  );

  const handleCompositionStart = useCallback(
    (e: React.CompositionEvent<HTMLInputElement>) => {
      // IME composition 중에는 필터링하지 않음
    },
    []
  );

  const handleCompositionEnd = useCallback(
    (e: React.CompositionEvent<HTMLInputElement>) => {
      // IME 조합 완료 후 값 반영
      const { name, value } = e.currentTarget;
      const nextValue =
        name === 'username' ? value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 10) : value;

      setFormData((prev) => ({
        ...prev,
        [name]: nextValue,
      }));
    },
    []
  );

  // 서버 검증 규칙과 동일한 조건
  const errors = useMemo(() => {
    const result: { username?: string; name?: string; password?: string; department?: string; employee_id?: string } = {};
    const username = formData.username.trim();
    const name = (formData.name || '').trim();
    const password = formData.password || '';

    if (!isEditMode && (username.length < 3 || username.length > 10)) {
      result.username = '아이디는 3~10자여야 합니다.';
    }

    // 아이디는 영문과 숫자를 포함해야 함
    if (!isEditMode && username && !/^(?=.*[a-zA-Z0-9])[a-zA-Z0-9_]+$/.test(username)) {
      result.username = '아이디는 영문과 숫자를 포함해야 합니다.';
    }

    // 아이디 중복 체크
    if (!isEditMode && debouncedUsername && usernameCheckResult && !usernameCheckResult.available) {
      result.username = '이미 사용 중인 아이디입니다.';
    }

    // 사번 중복 체크
    if (debouncedEmployeeId && employeeIdCheckResult && !employeeIdCheckResult.available) {
      result.employee_id = '이미 사용 중인 사번입니다.';
    }

    if (name.length < 2 || name.length > 10) {
      result.name = '이름은 2~10자여야 합니다.';
    }
    if (!isEditMode || password) {
      if (password.length < 6 || password.length > 10) {
        result.password = '비밀번호는 6~10자여야 합니다.';
      }
    }
    if (formData.role !== 'staff' && formData.role !== 'subadmin' && !formData.department) {
      result.department = '소속을 선택해주세요.';
    }
    return result;
  }, [formData, isEditMode, debouncedUsername, usernameCheckResult, debouncedEmployeeId, employeeIdCheckResult]);

  const isValid = Object.keys(errors).length === 0;

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!isValid) return;
      await onSubmit(formData);
    },
    [formData, onSubmit, isValid]
  );

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.formGroup}>
        <label htmlFor="username">아이디 <span className={styles.required}>*</span></label>
        <input
          type="text"
          id="username"
          name="username"
          value={formData.username}
          onChange={handleChange}
          onCompositionStart={handleCompositionStart}
          disabled={isEditMode}
          maxLength={15}
          autoComplete="off"
          className={styles.input}
        />
        {!isEditMode && (
          <div className={styles.helperRow}>
            {errors.username ? (
              <span className={styles.error}>{errors.username}</span>
            ) : isCheckingUsername ? (
              <span className={styles.loading}>중복 확인 중...</span>
            ) : debouncedUsername && usernameCheckResult?.available ? (
              <span className={styles.success}>사용 가능한 아이디입니다.</span>
            ) : formData.username && !debouncedUsername ? (
              <span className={styles.hint}>영문, 숫자, 언더스코어(_)만 사용할 수 있습니다.</span>
            ) : (
              <span className={styles.hint}>영문, 숫자, 언더스코어(_)만 사용할 수 있습니다.</span>
            )}
            <span className={styles.counter}>{formData.username.length} / 10</span>
          </div>
        )}
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="name">이름 <span className={styles.required}>*</span></label>
        <input
          type="text"
          id="name"
          name="name"
          value={formData.name || ''}
          onChange={handleChange}
          onCompositionEnd={handleCompositionEnd}
          maxLength={10}
          className={styles.input}
        />
        <div className={styles.helperRow}>
          {errors.name ? (
            <span className={styles.error}>{errors.name}</span>
          ) : formData.name ? (
            <span className={styles.success}>사용 가능한 이름입니다.</span>
          ) : (
            <span className={styles.hint}>2~10자로 입력해주세요.</span>
          )}
          <span className={styles.counter}>{(formData.name || '').length} / 10</span>
        </div>
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="password">비밀번호 {!isEditMode && <span className={styles.required}>*</span>}</label>
        <input
          type="password"
          id="password"
          name="password"
          value={formData.password || ''}
          onChange={handleChange}
          placeholder={isEditMode ? '변경하지 않으려면 비워두세요' : ''}
          maxLength={10}
          /*
           * 브라우저가 저장해 둔 로그인 정보를 채우지 않게 한다.
           *
           * 크롬은 type="password" 가 있으면 그 폼을 로그인 폼으로 보고 저장된
           * 계정을 아이디 칸에 밀어 넣는다. 아이디 칸의 autoComplete="off" 는
           * 그때 무시된다. 여기에 new-password 를 주면 "새 비밀번호를 만드는
           * 자리"로 보고 건드리지 않는다.
           */
          autoComplete="new-password"
          className={styles.input}
        />
        <div className={styles.helperRow}>
          {errors.password ? (
            <span className={styles.error}>{errors.password}</span>
          ) : formData.password ? (
            <span className={styles.success}>사용 가능한 비밀번호입니다.</span>
          ) : (
            <span className={styles.hint}>6~10자로 입력해주세요.</span>
          )}
          <span className={styles.counter}>{(formData.password || '').length} / 10</span>
        </div>
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="employee_id">사번</label>
        <input
          type="text"
          id="employee_id"
          name="employee_id"
          value={formData.employee_id || ''}
          onChange={(e) => {
            const value = e.target.value.replace(/[^0-9\-]/g, '');
            setFormData((prev) => ({
              ...prev,
              employee_id: value,
            }));
          }}
          maxLength={20}
          className={styles.input}
          placeholder="사번을 입력해주세요"
        />
        {formData.employee_id && (
          <div className={styles.helperRow}>
            {errors.employee_id ? (
              <span className={styles.error}>{errors.employee_id}</span>
            ) : isCheckingEmployeeId ? (
              <span className={styles.loading}>중복 확인 중...</span>
            ) : debouncedEmployeeId && employeeIdCheckResult?.available ? (
              <span className={styles.success}>사용 가능한 사번입니다.</span>
            ) : null}
          </div>
        )}
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="role">역할 <span className={styles.required}>*</span></label>
        {/* 관리자는 여기서 못 만든다 — 서버도 허용된 값만 받는다. */}
        <div className={styles.selectWrapper}>
          <select
            id="role"
            name="role"
            value={formData.role}
            onChange={(e) => {
              const role = e.target.value as UserFormType['role'];
              setFormData((prev) => ({
                ...prev,
                role,
                department:
                  role === 'staff'
                    ? STAFF_DEPARTMENT
                    : role === 'subadmin'
                      ? ADMIN_DEPARTMENT
                      : prev.department === STAFF_DEPARTMENT || prev.department === ADMIN_DEPARTMENT
                        ? ''
                        : prev.department,
              }));
            }}
            className={styles.select}
          >
            <option value="user">지사</option>
            <option value="subadmin">서브관리자</option>
            <option value="staff">DB담당자 (파일 업로드만 가능)</option>
          </select>
          <MdExpandMore className={styles.selectIcon} />
        </div>
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="department">소속 <span className={styles.required}>*</span></label>
        {formData.role === 'staff' ? (
          <div className={styles.selectWrapper}>
            <select id="department" className={styles.select} value={STAFF_DEPARTMENT} disabled>
              <option value={STAFF_DEPARTMENT}>{STAFF_DEPARTMENT} (자동 지정)</option>
            </select>
            <MdExpandMore className={styles.selectIcon} />
          </div>
        ) : formData.role === 'subadmin' ? (
          <div className={styles.selectWrapper}>
            <select id="department" className={styles.select} value={ADMIN_DEPARTMENT} disabled>
              <option value={ADMIN_DEPARTMENT}>관리자 (자동 지정)</option>
            </select>
            <MdExpandMore className={styles.selectIcon} />
          </div>
        ) : (
          <DepartmentSelect
            value={formData.department || ''}
            onChange={(value) =>
              setFormData((prev) => ({
                ...prev,
                department: value,
              }))
            }
          />
        )}
      </div>

      <div className={styles.formActions}>
        <button type="submit" className={styles.submitBtn} disabled={isLoading || !isValid}>
          {isLoading ? '처리 중...' : isEditMode ? '수정' : '추가'}
        </button>
        <button type="button" className={styles.cancelBtn} onClick={onCancel} disabled={isLoading}>
          취소
        </button>
      </div>
    </form>
  );
});

export default UserForm;
