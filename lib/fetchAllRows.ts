const PAGE_SIZE = 1000;

/**
 * PostgREST는 한 번의 select에 서버 상한(Supabase 기본 1000행)까지만 돌려준다.
 * range를 안 걸면 그 이상은 조용히 잘리고, 그 잘린 목록으로 검색·집계·정렬을 하면
 * 결과가 틀렸다는 신호도 없이 틀린다. count로 전체 개수를 받아 끝까지 이어 받는다.
 *
 * buildQuery는 호출할 때마다 새 쿼리를 만들어야 한다.
 * (PostgrestBuilder는 한 번 await하면 재사용할 수 없다.)
 * 넘기는 select에 { count: 'exact' }가 들어 있어야 전체 개수를 알 수 있다.
 */
export async function fetchAllRows<T>(
  buildQuery: () => any
): Promise<{ data: T[]; error: any }> {
  const rows: T[] = [];
  let from = 0;
  let total = Infinity;

  while (rows.length < total) {
    const { data, error, count } = await buildQuery().range(from, from + PAGE_SIZE - 1);

    if (error) {
      return { data: rows, error };
    }

    if (typeof count === 'number') {
      total = count;
    }

    const chunk = (data || []) as T[];
    // 더 받을 게 있다고 나오는데 빈 응답이면 여기서 끊는다. 무한 루프 방지.
    if (chunk.length === 0) {
      break;
    }

    rows.push(...chunk);
    from += chunk.length;
  }

  return { data: rows, error: null };
}
