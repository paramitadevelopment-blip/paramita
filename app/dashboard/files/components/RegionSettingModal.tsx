'use client';

import { Fragment, useEffect, useState } from 'react';
import { MdClose, MdHistory } from 'react-icons/md';
import { useAlert } from '@/app/components/Alert/Alert';
import { useAssignmentRules, useSaveAssignmentRules } from '@/app/hooks/useAssignmentRules';
import RegionSettingLogModal from './RegionSettingLogModal';
import { REGIONS, REGION_CITIES, type Region } from '@/lib/assignmentRegions';
import {
  AGE_BRACKETS,
  AGE_BRACKET_LABEL,
  describeIncomplete,
  findIncompleteRules,
  type AgeBracket,
} from '@/lib/assignmentRules';
import modalStyles from '../page.module.css';
import styles from './RegionSettingModal.module.css';

interface RegionSettingModalProps {
  onClose: () => void;
}

/** 소속 → 체크된 값들. 화면에서 다루기 쉽게 Set으로 들고 있는다 */
type RegionPicks = Record<string, Set<Region>>;
type AgePicks = Record<string, Set<AgeBracket>>;

/**
 * 지역설정 — 어느 소속이 어느 지역·나이대를 받는지 정한다.
 *
 * 지역과 나이는 AND로 걸린다. 경기지사가 '서울'과 '70세미만'을 골랐다면
 * 서울에서 온 70~75세 건은 경기지사로 가지 않는다.
 *
 * 아무도 안 맡은 조합이나 둘 이상이 맡은 조합은 배정하지 않고 분류 화면에서
 * 사람이 고르게 된다 — 여기서 다 정해야 하는 건 아니다.
 */
export default function RegionSettingModal({ onClose }: RegionSettingModalProps) {
  const { showAlert } = useAlert();
  const { data, isLoading } = useAssignmentRules(true);
  const saveMutation = useSaveAssignmentRules();

  const [regionPicks, setRegionPicks] = useState<RegionPicks>({});
  const [agePicks, setAgePicks] = useState<AgePicks>({});
  /** 시·군 목록을 펼쳐 둔 지역. 한 번에 하나만 편다 — 표가 이미 18줄이라 길다 */
  const [openCities, setOpenCities] = useState<Region | null>(null);
  /** 저장 이력을 펼쳤는가. 펼칠 때만 받아온다 */
  const [showLogs, setShowLogs] = useState(false);


  // 받아온 설정을 화면 상태로 옮긴다. 저장 전에는 화면에서만 고쳐진다 —
  // 체크할 때마다 서버에 보내면 중간에 실패했을 때 화면과 DB가 갈린다.
  useEffect(() => {
    if (!data) return;
    const regions: RegionPicks = {};
    const ages: AgePicks = {};
    for (const group of data.groups) {
      const rule = data.rules.find((r) => r.group === group);
      regions[group] = new Set(rule?.regions ?? []);
      ages[group] = new Set(rule?.ageBrackets ?? []);
    }
    setRegionPicks(regions);
    setAgePicks(ages);
  }, [data]);

  const groups = data?.groups ?? [];

  const toggleRegion = (group: string, region: Region) => {
    setRegionPicks((prev) => {
      const next = new Set(prev[group] ?? []);
      if (next.has(region)) next.delete(region);
      else next.add(region);
      return { ...prev, [group]: next };
    });
  };

  const toggleAge = (group: string, bracket: AgeBracket) => {
    setAgePicks((prev) => {
      const next = new Set(prev[group] ?? []);
      if (next.has(bracket)) next.delete(bracket);
      else next.add(bracket);
      return { ...prev, [group]: next };
    });
  };

  /** 한 지역 줄을 통째로 켜고 끈다. 하나라도 켜져 있으면 전부 끈다. */
  const toggleRow = (region: Region) => {
    const anyOn = groups.some((group) => regionPicks[group]?.has(region));
    setRegionPicks((prev) => {
      const next: RegionPicks = {};
      for (const group of groups) {
        const set = new Set(prev[group] ?? []);
        if (anyOn) set.delete(region);
        else set.add(region);
        next[group] = set;
      }
      return next;
    });
  };

  /** 지금 화면 상태를 저장할 모양으로. 검사와 저장이 같은 값을 봐야 한다 */
  const currentRules = groups.map((group) => ({
    group,
    regions: Array.from(regionPicks[group] ?? []),
    ageBrackets: Array.from(agePicks[group] ?? []),
  }));

  /*
   * 설정이 덜 된 소속. 지역과 나이는 AND로 걸려서 한쪽이 비면 그 소속은
   * 아무 건도 못 받는데, 화면상으로는 체크가 몇 개 있어 설정된 것처럼 보인다.
   */
  const incomplete = findIncompleteRules(currentRules);

  const handleSave = () => {
    // 저장 전에 막는다. 그대로 저장되면 그 지역 건이 전부 수동배정으로 떨어진다.
    if (incomplete.length > 0) {
      showAlert({
        type: 'error',
        title: '설정이 안된 소속이 있습니다',
        message: (
          <>
            모든 소속에 지역과 나이를 하나 이상 골라야 저장할 수 있습니다.
            <ul className={styles.alertList}>
              {incomplete.map((item) => (
                <li key={item.group}>
                  <b>{item.group}</b> — {describeIncomplete(item)}
                </li>
              ))}
            </ul>
          </>
        ),
      });
      return;
    }

    saveMutation.mutate(
      currentRules,
      {
        onSuccess: () => {
          showAlert({ type: 'success', title: '저장 완료', message: '배정 규칙을 저장했습니다.' });
          onClose();
        },
        onError: (error: Error) => {
          showAlert({ type: 'error', title: '오류', message: error.message });
        },
      }
    );
  };

  return (
    <div className={modalStyles.modal}>
      <div className={modalStyles.modalContent}>
        <div className={modalStyles.modalTitleBar}>
          <h2 className={modalStyles.modalTitle}>지역 설정</h2>
          <div className={styles.titleActions}>
            {/* 배정이 갑자기 달라졌을 때 "누가 언제 뭘 바꿨나"를 여기서 되짚는다 */}
            <button
              type="button"
              className={styles.logBtn}
              onClick={() => setShowLogs(true)}
              aria-haspopup="dialog"
            >
              <MdHistory />
              저장 이력
            </button>
          <button
            type="button"
            className={modalStyles.modalCloseBtn}
            onClick={onClose}
            aria-label="닫기"
          >
            <MdClose />
          </button>
          </div>
        </div>

        {isLoading ? (
          <div className={styles.loading}>불러오는 중입니다...</div>
        ) : groups.length === 0 ? (
          <div className={styles.empty}>배정할 수 있는 소속이 없습니다.</div>
        ) : (
          <>
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>지역</h3>
              <p className={styles.sectionHint}>
                각 지사가 받을 지역을 체크합니다. 한 지역을 여러 지사가 맡으면 자동으로
                배정하지 않고 분류 화면에서 직접 고르게 됩니다. 아무도 안 맡은 지역도
                마찬가지로 직접 고르게 되니, 전부 채우지 않아도 됩니다.
              </p>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.regionCell}>지역</th>
                      {groups.map((group) => (
                        <th key={group}>{group}</th>
                      ))}
                      <th>전체</th>
                    </tr>
                  </thead>
                  <tbody>
                    {REGIONS.map((region) => {
                      // 시·군까지 봐야 갈리는 지역만 '보기'가 붙는다 (지금은 경기 북/남)
                      const cities = REGION_CITIES[region];
                      const isOpen = openCities === region;

                      return (
                        <Fragment key={region}>
                          <tr>
                            <td className={styles.regionCell}>
                              <span className={styles.regionCellInner}>
                                {region}
                                {cities && (
                                  <button
                                    type="button"
                                    className={styles.viewBtn}
                                    onClick={() => setOpenCities(isOpen ? null : region)}
                                    aria-expanded={isOpen}
                                  >
                                    {isOpen ? '닫기' : '보기'}
                                  </button>
                                )}
                              </span>
                            </td>
                            {groups.map((group) => (
                              <td key={group}>
                                <input
                                  type="checkbox"
                                  className={styles.checkbox}
                                  checked={regionPicks[group]?.has(region) ?? false}
                                  onChange={() => toggleRegion(group, region)}
                                  aria-label={`${region} - ${group}`}
                                />
                              </td>
                            ))}
                            <td>
                              <button
                                type="button"
                                className={styles.rowToggle}
                                onClick={() => toggleRow(region)}
                              >
                                전체
                              </button>
                            </td>
                          </tr>

                          {isOpen && cities && (
                            <tr>
                              <td className={styles.cityCell} colSpan={groups.length + 2}>
                                <div className={styles.cityList}>
                                  {cities.map((city) => (
                                    <span key={city} className={styles.cityChip}>
                                      {city}
                                    </span>
                                  ))}
                                </div>
                                <p className={styles.cityNote}>
                                  주소가 &lsquo;경기&rsquo;로 시작해도 시·군이 이 목록에 없으면
                                  북부·남부를 가릴 수 없어 이외지역으로 갑니다.
                                </p>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>나이</h3>
              <p className={styles.sectionHint}>
                지역과 함께 걸립니다. 서울을 맡은 지사가 70세 미만만 골랐다면, 서울에서 온
                70~75세 건은 그 지사로 가지 않고 직접 고르는 목록으로 빠집니다.
              </p>

              <div className={styles.ageGrid}>
                {groups.map((group) => (
                  <div key={group} className={styles.ageCard}>
                    <div className={styles.ageCardTitle}>{group}</div>
                    {AGE_BRACKETS.map((bracket) => (
                      <label key={bracket} className={styles.ageOption}>
                        <input
                          type="checkbox"
                          className={styles.checkbox}
                          checked={agePicks[group]?.has(bracket) ?? false}
                          onChange={() => toggleAge(group, bracket)}
                        />
                        {AGE_BRACKET_LABEL[bracket]}
                      </label>
                    ))}
                  </div>
                ))}
              </div>

              {incomplete.length > 0 && (
                <div className={styles.warning}>
                  {incomplete.map((item) => `${item.group}(${describeIncomplete(item)})`).join(', ')}
                  {' '}— 이대로 두면 그 지사는 아무 건도 받지 못합니다. 저장할 수 없습니다.
                </div>
              )}
            </div>

            <div className={styles.footer}>
              <span className={styles.updatedAt}>
                {data?.updatedAt
                  ? `마지막 저장 ${new Date(data.updatedAt).toLocaleString('ko-KR')}${
                      data.updatedBy ? ` · ${data.updatedBy}` : ''
                    }`
                  : '아직 저장한 적이 없습니다'}
              </span>
              <div className={styles.actions}>
                <button type="button" className={styles.cancelBtn} onClick={onClose}>
                  취소
                </button>
                <button
                  type="button"
                  className={styles.saveBtn}
                  onClick={handleSave}
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 이력은 따로 띄운다. 설정 표 위에 펼치면 정작 고칠 표가 밀려 내려간다 */}
      {showLogs && <RegionSettingLogModal onClose={() => setShowLogs(false)} />}
    </div>
  );
}
