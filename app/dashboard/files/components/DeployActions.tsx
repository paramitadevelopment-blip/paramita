'use client';

import { resolveDeployGate, type DeployBusyPhase } from '@/lib/deployGate';
import styles from '../page.module.css';

interface DeployActionsProps {
  /** 지금 돌고 있는 단계. null이면 멈춰 있는 상태 */
  busy: DeployBusyPhase;
  /** 전체 파일의 오류 행 수 */
  errorCount: number;
  /** 아직 소속을 안 고른 지역들 */
  unpickedRegions: string[];
  /** 분류된 파일 개수. 0이면 배포할 게 없다 */
  fileCount: number;
  onCancel: () => void;
  onDeploy: () => void;
}

/**
 * 모달 바닥의 취소 / 배포 버튼.
 *
 * 배포를 막을 때는 버튼만 흐리게 두지 않고 왜 못 누르는지 글자로 보여준다.
 * 안 그러면 사람이 뭘 고쳐야 할지 모른 채 계속 누르게 된다.
 */
export default function DeployActions({
  busy,
  errorCount,
  unpickedRegions,
  fileCount,
  onCancel,
  onDeploy,
}: DeployActionsProps) {
  // 열지 말지와 뭐라고 보여줄지는 순수 규칙이라 lib에서 정한다.
  const { label, reason, disabled } = resolveDeployGate({ busy, errorCount, unpickedRegions, fileCount });

  return (
    <div className={styles.resultActions}>
      <button className={styles.cancelBtn} onClick={onCancel} disabled={busy !== null}>
        취소
      </button>
      <button
        className={styles.deployBtn}
        onClick={onDeploy}
        disabled={disabled}
        title={reason}
      >
        {label}
      </button>
    </div>
  );
}
