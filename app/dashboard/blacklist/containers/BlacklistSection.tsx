'use client';

import React, { useState, useCallback, memo } from 'react';
import { useAlert } from '@/app/components/Alert/Alert';
import { useBlacklist, type BlacklistRecord } from '@/app/hooks/useBlacklist';
import { usePreviewFile } from '@/app/hooks/useFileDownload';
import Spinner from '@/app/components/Spinner/Spinner';
import SearchBar from '@/app/components/SearchBar';
import Pagination from '@/app/components/Pagination/Pagination';
import EmptyState from '@/app/components/EmptyState/EmptyState';
import BlacklistTable from '../components/BlacklistTable';
import RegisterModal, { type RegisterForm } from '../components/RegisterModal';
import HistoryModal from '../components/HistoryModal';
import ReleaseInfoModal from '../components/ReleaseInfoModal';
import ExcelPreviewModal from '@/app/dashboard/download/components/ExcelPreviewModal';
import styles from '../page.module.css';

interface BlacklistSectionProps {
  showRegisterModal: boolean;
  setShowRegisterModal: (value: boolean) => void;
}

const EMPTY_FORM: RegisterForm = {
  customerName: '',
  birthDate: '',
  birthGender: '',
  tel1: '',
  tel2: '',
  reason: '',
};

const BlacklistSection = memo(function BlacklistSectionComponent({
  showRegisterModal,
  setShowRegisterModal,
}: BlacklistSectionProps) {
  const { showAlert } = useAlert();
  const previewMutation = usePreviewFile();
  const blacklist = useBlacklist();

  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [reasonModal, setReasonModal] = useState<BlacklistRecord | null>(null);
  const [historyModal, setHistoryModal] = useState<BlacklistRecord | null>(null);
  const [registerForm, setRegisterForm] = useState<RegisterForm>(EMPTY_FORM);

  const handlePreviewFile = useCallback(
    (fileId: string, fileName: string) => {
      previewMutation.mutate(
        { fileId, fileName },
        {
          onSuccess: (file) => setPreviewFile(file),
          onError: () => {
            showAlert({ type: 'error', title: '오류', message: '파일을 읽을 수 없습니다.' });
          },
        }
      );
    },
    [previewMutation, showAlert]
  );

  /**
   * 등록 모달을 닫는다.
   *
   * 닫는 길이 셋(X·취소·등록 완료)이라 초기화를 각자 들고 있으면 하나가 빠진다.
   * 남아 있던 값이 다음에 열 때 그대로 보이면 엉뚱한 사람을 등록하게 된다.
   */
  const closeRegisterModal = useCallback(() => {
    setShowRegisterModal(false);
    setRegisterForm(EMPTY_FORM);
  }, [setShowRegisterModal]);

  const { register } = blacklist;
  const handleRegister = useCallback(() => {
    const { customerName, birthDate, birthGender, tel1, tel2, reason } = registerForm;
    if (!customerName || !birthDate || !birthGender || !tel1 || !reason) {
      showAlert({ type: 'error', title: '오류', message: '필수 정보를 모두 입력해주세요.' });
      return;
    }

    register(
      {
        customerName,
        birth: birthDate + birthGender,
        tel1,
        // 비워 두면 번호를 하나만 쓰는 사람이다. 같은 값으로 채워 두면 표에서 읽기 쉽다.
        tel2: tel2 || tel1,
        reason,
      },
      { onSuccess: closeRegisterModal }
    );
  }, [registerForm, register, showAlert, closeRegisterModal]);

  const { release } = blacklist;
  const handleRemove = useCallback(
    (record: BlacklistRecord) => {
      let inputReason = '';

      showAlert({
        type: 'error',
        title: '블랙리스트 해제',
        message: (
          <>
            <strong>{record.customer_name || '(이름 없음)'}</strong> 님을 블랙리스트에서
            해제하시겠습니까?
            <br />
            같은 번호로 등록된 다른 줄도 함께 해제됩니다.
            <br />
            해제 후에도 60일 안에 3회 이상 신청하면 다시 등록됩니다.
            <br />
            <label className={styles.releaseReasonLabel}>
              해제 사유:
              <textarea
                onChange={(e) => {
                  inputReason = e.target.value.trim();
                }}
                placeholder="해제 사유를 입력해주세요"
                className={styles.releaseReasonInput}
              />
            </label>
          </>
        ),
        showCancelButton: true,
        onConfirm: () => release({ id: record.id, reason: inputReason || '사유 없음' }),
      });
    },
    [showAlert, release]
  );

  return (
    <>
      <Spinner isLoading={blacklist.isLoading} />

      <div className={styles.searchSection}>
        <div className={styles.totalCount}>
          총 <span>{blacklist.pagination?.totalRecords ?? 0}</span>명
        </div>
        <SearchBar
          value={blacklist.search}
          onChange={blacklist.setSearch}
          onReset={() => blacklist.setSearch('')}
        />
      </div>

      <div className={styles.controlsSection}>
        <select
          className={styles.select}
          value={blacklist.sortBy}
          onChange={(e) => blacklist.setSortBy(e.target.value)}
        >
          <option value="registered_at">등록일순</option>
          <option value="customer_name">고객명순</option>
          <option value="birth">생년월일순</option>
          <option value="tel2">전화번호순</option>
          <option value="request_count">신청횟수순</option>
          <option value="registered_by">등록경로순</option>
        </select>

        <select
          className={styles.select}
          value={blacklist.limit}
          onChange={(e) => blacklist.setLimit(Number(e.target.value))}
        >
          <option value="10">10개씩보기</option>
          <option value="20">20개씩보기</option>
          <option value="30">30개씩보기</option>
          <option value="50">50개씩보기</option>
        </select>
      </div>

      <label className={styles.releasedToggle}>
        <input
          type="checkbox"
          checked={blacklist.onlyReleased}
          onChange={(e) => blacklist.setOnlyReleased(e.target.checked)}
        />
        해제된 항목 보기
      </label>

      {blacklist.error ? (
        <EmptyState message="블랙리스트를 불러올 수 없습니다." />
      ) : blacklist.records.length === 0 ? (
        <EmptyState
          message={
            blacklist.search
              ? '검색 결과가 없습니다.'
              : blacklist.onlyReleased
                ? '해제된 항목이 없습니다.'
                : '블랙리스트에 등록된 고객이 없습니다.'
          }
        />
      ) : (
        <BlacklistTable
          records={blacklist.records}
          sortBy={blacklist.sortBy}
          sortOrder={blacklist.sortOrder}
          onSort={blacklist.toggleSort}
          onRemove={handleRemove}
          isRemoving={blacklist.isReleasing}
          onFileNameClick={handlePreviewFile}
          onViewReason={setReasonModal}
          onCountClick={setHistoryModal}
        />
      )}

      <Pagination
        currentPage={blacklist.page}
        totalPages={blacklist.pagination?.totalPages ?? 1}
        onPageChange={blacklist.changePage}
        isLoading={blacklist.isLoading}
      />

      {previewFile && (
        <ExcelPreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
      )}

      {showRegisterModal && (
        <RegisterModal
          form={registerForm}
          onChange={setRegisterForm}
          onSubmit={handleRegister}
          onClose={closeRegisterModal}
          isSubmitting={blacklist.isRegistering}
        />
      )}

      {historyModal !== null && (
        <HistoryModal
          record={historyModal}
          onPreviewFile={handlePreviewFile}
          onClose={() => setHistoryModal(null)}
        />
      )}

      {reasonModal !== null && (
        <ReleaseInfoModal record={reasonModal} onClose={() => setReasonModal(null)} />
      )}
    </>
  );
});

export default BlacklistSection;
