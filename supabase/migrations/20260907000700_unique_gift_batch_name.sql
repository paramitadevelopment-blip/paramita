-- 한 지사 안에서 묶음 이름은 겹치지 않는다.
--
-- 이름은 사람이 폴더를 가리키는 말이다. '260907_경기_01'이 둘이면 "그 폴더에
-- 담아 주세요"가 어느 쪽인지 알 수 없고, 담당자 화면에도 같은 이름 둘이 나란히
-- 뜬다. 그래서 겹치는 이름을 DB에서 막는다.
--
-- 지사가 다르면 같은 이름을 써도 된다 — 폴더는 지사의 것이고, 다른 지사의
-- 이름까지 피해 가며 지을 이유가 없다.

CREATE UNIQUE INDEX IF NOT EXISTS uniq_gift_batches_group_name
  ON public.gift_batches (group_name, name);
