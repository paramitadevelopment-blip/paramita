const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

/**
 * 쿼리스트링의 page/limit을 안전한 값으로 바꾼다.
 * 그대로 쓰면 limit=999999로 한 번에 전부 긁어가거나, page=abc가 NaN이 되어
 * slice(NaN, NaN)으로 빈 목록이 나가는 식으로 조용히 어긋난다.
 */
export function parsePagination(
  pageParam: string | null,
  limitParam: string | null
): { page: number; limit: number; offset: number } {
  const parsedPage = parseInt(pageParam || '1', 10);
  const parsedLimit = parseInt(limitParam || String(DEFAULT_LIMIT), 10);

  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  // 0이나 음수도 abc와 마찬가지로 말이 안 되는 값이다. 1건만 주는 건 근거가 없으니
  // 숫자가 아닐 때와 똑같이 기본값으로 떨어뜨린다.
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;

  return { page, limit, offset: (page - 1) * limit };
}
