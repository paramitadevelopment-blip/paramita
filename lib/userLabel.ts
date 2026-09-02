/**
 * 사람을 한 칸에 표시할 때 쓰는 형태 — `아이디(이름)`.
 *
 * 아이디만 보여주면 누구인지 바로 안 떠오르고, 이름만 보여주면 동명이인을
 * 못 가린다. 화면마다 다른 모양으로 붙이면 같은 사람이 다르게 보이므로
 * 여기 한 곳에 모아 둔다. 이름을 모르면(계정 삭제 등) 아이디만 남긴다.
 */
export function formatUserLabel(username: string, name?: string | null): string {
  return name ? `${username}(${name})` : username;
}
