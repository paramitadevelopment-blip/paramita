-- 직전 배정 건의 '배정된 날'을 함께 남긴다.
--
-- 지금은 신청한 날(previous_applied_at)만 남기고 있다. 그런데 되짚을 때는
-- 둘 다 필요하다 — 신청은 고객이 한 일이고 배정은 우리가 한 일이라 며칠
-- 벌어진다. "8월 20일에 신청해서 8월 25일에 파라인슈로 갔다"를 보려면
-- 두 날짜가 다 있어야 한다.
--
-- 이 값은 배포 파일의 '배정날짜' 열에서 온다. 그 열을 못 읽은 옛 건은
-- 비어 있을 수 있어서 NULL을 허용한다.

ALTER TABLE public.complaints
  ADD COLUMN previous_assigned_at timestamp with time zone;
