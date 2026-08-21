import type { QueryClient } from '@tanstack/react-query';

/**
 * 대시보드 요약 캐시를 무효화한다.
 *
 * 대시보드는 사용자·소속·파일을 한꺼번에 세는 화면이라, 이 셋 중 하나라도
 * 바꾸는 곳에서 불러줘야 숫자가 따라온다. 부르는 곳이 여러 군데라
 * 각자 문자열을 적으면 오타가 나거나 빠뜨려도 아무도 모르므로 여기로 모은다.
 *
 * 지금 부르는 곳 — 새 기능이 이 셋을 건드리면 여기도 함께 늘려야 한다:
 *   - 사용자 생성·수정·삭제      → 총 사용자, 오늘 추가된 사용자, 소속별 사용자 수
 *   - 소속 생성·삭제             → 총 소속, 소속별 통계
 *   - 파일 업로드·배포·삭제·복구 → 업로드 파일, 소속별 파일 수
 */
export function invalidateDashboard(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['dashboard'] });
}
