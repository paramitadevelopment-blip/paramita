/**
 * 사람이 치는 전화번호에 하이픈을 넣어 준다.
 *
 * 사람이 직접 치는 값이라 010-1234-5678, 01012345678, 010 1234 5678이 섞인다.
 * 서버는 어차피 하이픈을 벗겨 저장하지만(normalizePhone), 화면에서 자릿수가
 * 눈에 보여야 한 자리 빠뜨린 걸 알아챈다.
 *
 * 치는 도중에도 불려서 '010', '010-1', '010-1234-5'처럼 덜 채운 상태로도
 * 자연스럽게 보여야 한다 — 다 채웠을 때만 모양을 잡으면 커서가 튄다.
 */

/**
 * 서울(02)은 국번이 두 자리다.
 *
 * 3-4-4로 자르면 '02-123-4567'이 '021-234-567'이 되어 다른 번호처럼 보인다.
 * 지역번호가 세 자리인 곳(031·051 …)은 휴대전화와 자릿수 규칙이 같아 따로
 * 가를 것이 없다.
 */
function formatSeoul(digits: string): string {
  if (digits.length <= 2) return digits;
  // 9자리(02-123-4567)와 10자리(02-1234-5678)가 둘 다 쓰인다.
  const middle = digits.length <= 9 ? 5 : 6;
  if (digits.length <= middle) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, middle)}-${digits.slice(middle, 10)}`;
}

export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('02')) return formatSeoul(digits);

  if (digits.length <= 3) return digits;

  /*
   * 가운데 토막이 세 자리냐 네 자리냐.
   *
   * 휴대전화(010)는 언제나 3-4-4다 — 치는 도중에 하이픈이 옮겨 다니지 않게
   * 길이를 안 본다. 그 밖의 번호는 자릿수로 가른다: 10자리는 3-3-4
   * (031-123-4567), 11자리는 3-4-4 (070-1234-5678).
   */
  const middleIsFour = digits.startsWith('010') || digits.length >= 11;
  const middleEnd = middleIsFour ? 7 : 6;

  if (digits.length <= middleEnd) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, middleEnd)}-${digits.slice(middleEnd, 11)}`;
}
