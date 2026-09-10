/**
 * 페이지 번호 줄에 무엇을 그릴지 정한다.
 *
 * 전에는 전체 쪽수를 그대로 다 그렸다. 자료가 쌓여 백 쪽이 되면 번호가 백 개
 * 늘어서서 줄이 화면을 넘고, 정작 다음 쪽으로 넘어가려는 화살표가 밀려났다.
 *
 * 지금 쪽 둘레만 남기고 사이는 '…'으로 접는다. 첫 쪽과 끝 쪽은 늘 보인다 —
 * "맨 앞으로"와 "맨 뒤로"가 화살표에도 있지만, 번호로 보이면 지금 어디쯤인지
 * 함께 읽힌다.
 *
 * 순수 계산이라 lib에 둔다. 그리는 일은 화면이 맡는다.
 */

/** 번호이거나, 접힌 자리다. */
export type PageItem = number | 'gap';

/**
 * @param current 지금 쪽 (1부터)
 * @param total   전체 쪽수
 * @param span    지금 쪽 양옆으로 몇 개까지 보일지
 */
export function pageWindow(current: number, total: number, span = 2): PageItem[] {
  if (!Number.isFinite(total) || total < 1) return [];
  const now = Math.min(Math.max(Math.round(current), 1), total);

  const range = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i);

  /*
   * 그리는 칸 수는 어디서나 같다(span*2+5).
   *
   * 지금 쪽이 옮겨 다닐 때마다 줄 길이가 달라지면 번호가 좌우로 흔들려,
   * 같은 자리를 다시 누르려다 딴 쪽을 누르게 된다. 가장자리에서는 '…' 하나가
   * 빠지는 대신 번호를 그만큼 더 펼쳐 칸 수를 맞춘다.
   */
  const slots = span * 2 + 5;
  if (total <= slots) return range(1, total);

  // 가장자리에서 펼칠 번호 수. 첫 쪽·'…'·끝 쪽을 뺀 나머지다.
  const wide = span * 2 + 3;

  /*
   * '…'이 한 쪽만 감추면 접은 보람이 없다 — '1 … 3'은 2를 숨기고도 자리를
   * 그대로 쓴다. 그렇게 될 자리에서는 펼친다.
   */
  if (now <= span + 3) return [...range(1, wide), 'gap', total];
  if (now >= total - span - 2) return [1, 'gap', ...range(total - wide + 1, total)];

  return [1, 'gap', ...range(now - span, now + span), 'gap', total];
}
