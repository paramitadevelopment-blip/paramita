import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 어느 화면에 누가 들어갈 수 있는가.
 *
 * 미들웨어의 화이트리스트에 안 들어간 `/dashboard` 하위 경로는 전부 관리자
 * 전용이다. 새 화면을 만들고 여기를 안 열면, 지사 사용자는 메뉴를 눌러도
 * 조용히 다운로드 화면으로 되돌려진다 — 오류도 안 나서 원인을 찾기 어렵다.
 * 재신청 고객을 만들 때 실제로 그 일이 있었다.
 */

let tokenRole: string | null = 'user';

vi.mock('jose', () => ({
  jwtVerify: async () => {
    if (tokenRole === null) throw new Error('invalid');
    return { payload: { role: tokenRole } };
  },
}));

process.env.JWT_SECRET = 'test-secret-value-long-enough-for-tests';

const { proxy } = await import('@/proxy');
const { NextRequest } = await import('next/server');

/** 로그인한 사람이 이 주소를 열면 어디로 가는가 */
async function visit(pathname: string, role: string | null = 'user') {
  tokenRole = role;
  // NextRequest 여야 한다. 미들웨어가 nextUrl·cookies 를 쓴다.
  const request = new NextRequest(`http://localhost${pathname}`, {
    headers: { cookie: 'authToken=dummy' },
  });
  const res = await proxy(request);
  const location = res.headers.get('location');
  return location ? new URL(location).pathname : null;
}

beforeEach(() => {
  tokenRole = 'user';
});

describe('지사 사용자가 들어갈 수 있는 화면', () => {
  it('파일 다운로드', async () => {
    expect(await visit('/dashboard/download')).toBeNull();
  });

  /** 이걸 안 열면 메뉴를 눌러도 다운로드 화면으로 되돌려진다. */
  it('재신청 고객', async () => {
    expect(await visit('/dashboard/reapply')).toBeNull();
  });
});

describe('지사 사용자가 못 들어가는 화면', () => {
  const 관리자전용 = [
    '/dashboard/users',
    '/dashboard/files',
    '/dashboard/blacklist',
    '/dashboard/search',
    '/dashboard/download-history',
    '/dashboard/download-approval',
    '/dashboard/original-files',
  ];

  for (const path of 관리자전용) {
    it(`${path} 는 다운로드 화면으로 되돌려진다`, async () => {
      expect(await visit(path)).toBe('/dashboard/download');
    });
  }

  /** 화이트리스트에 없는 새 경로는 기본으로 막힌다 — 실수로 열리지 않게 */
  it('목록에 없는 새 경로도 막힌다', async () => {
    expect(await visit('/dashboard/무언가새로운것')).toBe('/dashboard/download');
  });
});

describe('관리자는 전부 들어간다', () => {
  for (const path of ['/dashboard/users', '/dashboard/blacklist', '/dashboard/reapply']) {
    it(path, async () => {
      expect(await visit(path, 'admin')).toBeNull();
    });
  }
});

/**
 * 루트로 들어오면 각자 첫 화면으로 보낸다. 한 곳으로만 보내면 일반 사용자는
 * 대시보드에 못 들어가서 곧바로 한 번 더 튕긴다.
 */
describe('루트 경로', () => {
  it('관리자는 대시보드로', async () => {
    expect(await visit('/', 'admin')).toBe('/dashboard');
  });

  it('일반 사용자는 파일 다운로드로', async () => {
    expect(await visit('/', 'user')).toBe('/dashboard/download');
  });

  it('토큰을 못 읽으면 로그인으로', async () => {
    expect(await visit('/', null)).toBe('/login');
  });

  /** 보내는 곳이 그 사람이 들어갈 수 있는 화면이어야 한다. 아니면 또 튕긴다. */
  it('보낸 곳에서 다시 튕기지 않는다', async () => {
    for (const role of ['admin', 'user']) {
      const 목적지 = await visit('/', role);
      expect(await visit(목적지!, role)).toBeNull();
    }
  });
});

describe('토큰이 없거나 못 읽으면', () => {
  it('로그인 화면으로 보낸다', async () => {
    expect(await visit('/dashboard/reapply', null)).toBe('/login');
  });
});
