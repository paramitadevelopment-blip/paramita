import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeviceInfo } from '@/lib/deviceInfo';

/**
 * 로그인 기록 쓰기.
 *
 * 실패한 시도도 남긴다 — 성공만 남기면 사고가 난 뒤에나 쓸모가 있는데,
 * 실패 기록이 있으면 사고 전에 알아챌 수 있다.
 */

/** 왜 실패했는지. 화면과 DB가 같은 문구를 쓰도록 여기 모아 둔다. */
export const LOGIN_FAIL_NO_USER = '없는 아이디';
export const LOGIN_FAIL_WRONG_PASSWORD = '비밀번호 불일치';

/** 로그인에 성공한 사람. 그때의 소속·역할을 함께 적어 둔다. */
export interface LoginUser {
  id: number;
  username: string;
  name?: string | null;
  department?: string | null;
  role?: string | null;
}

/**
 * 로그인 시도 한 건을 남긴다.
 *
 * **기록에 실패해도 로그인을 막지 않는다.** DB가 잠깐 흔들렸다고 사람이 못
 * 들어오면 안 된다. 기록은 참고 자료고, 로그인은 업무 자체다.
 *
 * @param user 성공했으면 그 사람. 실패했으면 null (없는 아이디일 수 있다)
 */
export async function recordLogin(
  supabase: SupabaseClient,
  params: {
    username: string;
    success: boolean;
    failReason?: string | null;
    user?: LoginUser | null;
    device: DeviceInfo;
  }
): Promise<void> {
  const { username, success, failReason, user, device } = params;

  try {
    const { error } = await supabase.from('login_records').insert({
      user_id: user?.id ?? null,
      // 입력한 아이디를 그대로 적는다. 없는 아이디로 시도한 것도 단서다.
      username: String(username ?? '').slice(0, 100),
      user_name: user?.name ?? null,
      user_department: user?.department ?? null,
      user_role: user?.role ?? null,
      success,
      fail_reason: success ? null : (failReason ?? null),
      ip_address: device.ip_address,
      device_type: device.device_type,
      os_name: device.os_name,
      browser_name: device.browser_name,
    });

    if (error) console.error('Failed to record login:', error);
  } catch (error) {
    console.error('Failed to record login:', error);
  }
}
