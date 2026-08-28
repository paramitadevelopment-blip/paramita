import { describe, it, expect } from 'vitest';
import { extractDeviceInfo } from '@/lib/deviceInfo';
import {
  recordLogin,
  LOGIN_FAIL_NO_USER,
  LOGIN_FAIL_WRONG_PASSWORD,
} from '@/lib/loginRecord';

/**
 * 로그인 기록.
 *
 * 실패한 시도까지 남긴다 — 성공만 남기면 사고가 난 뒤에나 쓸모가 있는데,
 * 실패 기록이 있으면 사고 전에 알아챌 수 있다.
 */

const CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const req = (headers: Record<string, string>) => ({
  headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
});

function fakeSupabase(withError = false) {
  const inserted: any[] = [];
  const client = {
    from() {
      return {
        insert(row: any) {
          inserted.push(row);
          return Promise.resolve({ error: withError ? new Error('DB 장애') : null });
        },
      };
    },
  };
  return { client: client as any, inserted };
}

const device = extractDeviceInfo(req({ 'user-agent': CHROME, 'x-forwarded-for': '1.2.3.4' }));

describe('기기 정보 읽기', () => {
  it('브라우저와 OS를 가려낸다', () => {
    const got = extractDeviceInfo(req({ 'user-agent': CHROME }));

    expect(got.browser_name).toBe('Chrome');
    expect(got.os_name).toBe('Windows');
  });

  /** 데스크톱 브라우저는 device.type 을 안 준다. 빈 값이 곧 데스크톱이다. */
  it('데스크톱은 desktop 으로 본다', () => {
    expect(extractDeviceInfo(req({ 'user-agent': CHROME })).device_type).toBe('desktop');
  });

  it('휴대폰을 가려낸다', () => {
    expect(extractDeviceInfo(req({ 'user-agent': IPHONE })).device_type).toBe('mobile');
  });

  /** 프록시를 여러 단 거치면 쉼표로 이어 붙는다. 맨 앞이 실제 접속자다. */
  it('여러 단을 거친 IP 중 맨 앞을 쓴다', () => {
    const got = extractDeviceInfo(
      req({ 'user-agent': CHROME, 'x-forwarded-for': '1.2.3.4, 10.0.0.1, 172.16.0.1' })
    );

    expect(got.ip_address).toBe('1.2.3.4');
  });

  it('헤더가 없으면 IP는 null', () => {
    expect(extractDeviceInfo(req({ 'user-agent': CHROME })).ip_address).toBeNull();
  });

  it('user-agent 가 없어도 터지지 않는다', () => {
    const got = extractDeviceInfo(req({}));

    expect(got.device_type).toBe('desktop');
    expect(got.browser_name).toBeNull();
  });
});

const user = { id: 7, username: 'para', name: '김담당', department: '파라인슈', role: 'user' };

describe('성공한 로그인', () => {
  it('누가 어디서 들어왔는지 남긴다', async () => {
    const { client, inserted } = fakeSupabase();

    await recordLogin(client, { username: 'para', success: true, user, device });

    expect(inserted[0]).toMatchObject({
      user_id: 7,
      username: 'para',
      user_name: '김담당',
      user_department: '파라인슈',
      user_role: 'user',
      success: true,
      ip_address: '1.2.3.4',
      browser_name: 'Chrome',
      os_name: 'Windows',
    });
  });

  it('성공에는 실패 사유를 안 적는다', async () => {
    const { client, inserted } = fakeSupabase();

    await recordLogin(client, {
      username: 'para',
      success: true,
      failReason: '남아 있던 값',
      user,
      device,
    });

    expect(inserted[0].fail_reason).toBeNull();
  });

  /**
   * 소속·역할을 복사해 둔다. 나중에 소속을 옮기거나 계정을 지워도 그때 기록은
   * 그대로여야 한다.
   */
  it('그때의 소속을 복사해 둔다', async () => {
    const { client, inserted } = fakeSupabase();

    await recordLogin(client, {
      username: 'para',
      success: true,
      user: { ...user, department: '한울부원' },
      device,
    });

    expect(inserted[0].user_department).toBe('한울부원');
  });
});

describe('실패한 로그인', () => {
  /** 없는 아이디로 시도하면 user_id 가 없다. 그래도 무엇으로 시도했는지는 남아야 한다. */
  it('없는 아이디도 시도한 아이디를 남긴다', async () => {
    const { client, inserted } = fakeSupabase();

    await recordLogin(client, {
      username: 'nobody',
      success: false,
      failReason: LOGIN_FAIL_NO_USER,
      device,
    });

    expect(inserted[0]).toMatchObject({
      user_id: null,
      username: 'nobody',
      success: false,
      fail_reason: LOGIN_FAIL_NO_USER,
    });
  });

  /**
   * 아이디는 맞고 비밀번호만 틀린 것과 아이디 자체가 없는 것은 다른 신호다.
   * 화면에는 같은 문구를 보여주되(아이디 존재 여부를 흘리지 않는다) 기록은 나눈다.
   */
  it('비밀번호만 틀린 것은 없는 아이디와 다르게 남는다', async () => {
    const { client, inserted } = fakeSupabase();

    await recordLogin(client, {
      username: 'para',
      success: false,
      failReason: LOGIN_FAIL_WRONG_PASSWORD,
      user,
      device,
    });

    expect(inserted[0].fail_reason).toBe(LOGIN_FAIL_WRONG_PASSWORD);
    expect(inserted[0].user_id).toBe(7);
    expect(LOGIN_FAIL_WRONG_PASSWORD).not.toBe(LOGIN_FAIL_NO_USER);
  });

  it('실패해도 IP와 기기는 남긴다 — 그게 단서다', async () => {
    const { client, inserted } = fakeSupabase();

    await recordLogin(client, {
      username: 'nobody',
      success: false,
      failReason: LOGIN_FAIL_NO_USER,
      device,
    });

    expect(inserted[0].ip_address).toBe('1.2.3.4');
    expect(inserted[0].browser_name).toBe('Chrome');
  });
});

/**
 * 기록은 참고 자료고 로그인은 업무 자체다. DB가 잠깐 흔들렸다고 사람이 못
 * 들어오면 안 된다.
 */
describe('기록이 실패해도 로그인을 막지 않는다', () => {
  it('DB 오류를 던지지 않는다', async () => {
    const { client } = fakeSupabase(true);

    await expect(
      recordLogin(client, { username: 'para', success: true, user, device })
    ).resolves.toBeUndefined();
  });

  it('클라이언트가 통째로 망가져도 던지지 않는다', async () => {
    const broken: any = {
      from() {
        throw new Error('연결 끊김');
      },
    };

    await expect(
      recordLogin(broken, { username: 'para', success: true, user, device })
    ).resolves.toBeUndefined();
  });
});
