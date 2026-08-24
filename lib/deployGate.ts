/**
 * 배포 버튼을 열지 말지, 못 열면 뭐라고 보여줄지 정하는 규칙.
 *
 * 버튼만 흐리게 두면 사람이 뭘 고쳐야 할지 모른 채 계속 누른다.
 * 막는 이유를 글자로 같이 내보낸다.
 */

/** 지금 돌고 있는 단계. null이면 멈춰 있는 상태 */
export type DeployBusyPhase = '분류' | '업로드' | '배포' | null;

export interface DeployGateInput {
  busy: DeployBusyPhase;
  /** 전체 파일의 오류 행 수 */
  errorCount: number;
  /** 아직 소속을 안 고른 지역들 */
  unpickedRegions: string[];
  /** 분류된 파일 개수. 0이면 배포할 게 없다 */
  fileCount: number;
}

export interface DeployGateState {
  /** 버튼에 찍을 글자 */
  label: string;
  /** 마우스를 올렸을 때 나오는 이유. 막을 게 없으면 빈 문자열 */
  reason: string;
  disabled: boolean;
}

export function resolveDeployGate({
  busy,
  errorCount,
  unpickedRegions,
  fileCount,
}: DeployGateInput): DeployGateState {
  const canDeploy = errorCount === 0 && fileCount > 0 && unpickedRegions.length === 0;

  const label = busy
    ? `${busy} 중...`
    : errorCount > 0
      ? `${errorCount}개 오류 (배포 불가)`
      : unpickedRegions.length > 0
        ? `${unpickedRegions.length}개 지역 배정 필요`
        : '배포하기';

  const reason =
    errorCount > 0
      ? `${errorCount}개 행에 오류가 있어 배포할 수 없습니다.`
      : unpickedRegions.length > 0
        ? `배정 부서를 안 고른 지역: ${unpickedRegions.join(', ')}`
        : '';

  return { label, reason, disabled: busy !== null || !canDeploy };
}

/**
 * 분류에 보낼 수 있는 파일만 고른다.
 * 엑셀이 아닌 파일은 서버가 읽지 못하므로 보내봐야 오류만 난다.
 */
const CLASSIFIABLE_EXTENSIONS = ['.xlsx', '.xls', '.csv'];

export function isClassifiableFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return CLASSIFIABLE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
