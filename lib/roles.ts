/**
 * 역할별로 할 수 있는 일을 한 곳에 모은다.
 *
 * - admin: 전체 권한 (사용자 관리 포함)
 * - subadmin: 서브관리자 (사용자 관리를 제외한 모든 관리자 권한)
 * - staff: DB담당자 (파일전달 및 원본 업로드만 가능)
 * - user: 지사 (배포된 파일 다운로드, 재신청 고객 열람 등)
 */

/** 관리자급 역할 (admin, subadmin) */
export const ADMIN_ROLES = ['admin', 'subadmin'] as const;

/** 원본을 저장소에 올릴 수 있는 역할. files/upload API가 쓴다. */
export const UPLOAD_ROLES = ['admin', 'subadmin', 'staff'] as const;

/** 관리자급(관리자 또는 서브관리자)인지 검사 */
export function isAdminRole(role?: string | null): boolean {
  if (!role) return false;
  return (ADMIN_ROLES as readonly string[]).includes(role);
}

/** 원본 파일 업로드 권한이 있는지 검사 */
export function canUploadFiles(role?: string | null): boolean {
  if (!role) return false;
  return (UPLOAD_ROLES as readonly string[]).includes(role);
}

