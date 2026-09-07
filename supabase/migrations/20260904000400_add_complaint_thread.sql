-- 같은 건의 반복 민원을 묶는다.
--
-- 주문번호는 사람이 아니라 '그 주문 한 건'의 고유번호다. 같은 주문으로 민원이
-- 여러 번 들어오는 것은 정상이다 — 통화할 때마다 고객이 원하는 것이 달라지고,
-- 상품 설명도 달라진다. 그래서 막지 않고 묶는다.
--
-- 묶는 열쇠는 변하지 않는 것만 쓴다: 주문번호 + 전화번호(숫자만).
-- 상품명·통화내역·접수일자는 건마다 달라지므로 열쇠에서 뺀다.

ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS thread_key text,
  -- 그 묶음에서 몇 번째인가. 목록에 '2차'로 뜬다.
  ADD COLUMN IF NOT EXISTS sequence_no integer NOT NULL DEFAULT 1;

-- 한 묶음을 시간 순으로 읽는다. 목록에서 페이지마다 묶음 정보를 다시 물으므로
-- thread_key 로 찾는 일이 잦다.
CREATE INDEX IF NOT EXISTS idx_complaints_thread
  ON public.complaints (thread_key, created_at);

/*
 * 이미 들어와 있는 건에도 열쇠를 채운다.
 *
 * 열쇠가 비어 있으면 그 건만 묶이지 않아, 같은 고객이 또 민원을 넣어도
 * 1차로 보인다. 지금 있는 것부터 맞춰 둔다.
 */
UPDATE public.complaints
SET thread_key = COALESCE(order_no, '') || '|' || regexp_replace(COALESCE(phone, ''), '\D', '', 'g')
WHERE thread_key IS NULL;

/*
 * 회차도 다시 매긴다. 같은 열쇠 안에서 들어온 순서다.
 */
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY thread_key ORDER BY created_at, id) AS seq
  FROM public.complaints
  WHERE thread_key IS NOT NULL
)
UPDATE public.complaints c
SET sequence_no = numbered.seq
FROM numbered
WHERE c.id = numbered.id;
