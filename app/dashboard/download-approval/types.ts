export interface RequestRecord {
  id: number;
  file_id: string;
  /** 계정이 지워지면 NULL이 된다. 요청 자체는 이력으로 남는다. */
  user_id: number | null;
  file_name: string;
  /** 이 파일 전체(요청자 무관) 누적 거부 횟수 */
  file_reject_count: number;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
  /** 요청자가 쓴 사유 */
  reason: string | null;
  /** 관리자가 거부하며 남긴 사유 */
  review_reason: string | null;
  reviewed_by: number | null;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  user_username: string | null;
  user_name: string | null;
  user_employee_id: string | null;
  user_department: string | null;
}
