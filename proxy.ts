import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const publicRoutes = ['/login'];
const publicApiRoutes = ['/api/auth/login'];

// 일반 사용자(비 admin)가 접근 가능한 대시보드 경로 (화이트리스트)
// 여기 없는 /dashboard 하위 경로는 전부 admin 전용으로 간주한다.
//
// 재신청 고객은 지사가 자기 소속 건만 본다. 무엇을 보여줄지는 API가 소속으로
// 거르므로, 여기서는 화면에 들어올 수 있게만 열어 준다.
const userAllowedRoutes = ['/dashboard/download', '/dashboard/reapply'];

// DB담당자는 파일전달 화면만 쓴다. 원본을 올리기만 하고, 분류·배포는 관리자
// 몫이라 파일 업로드 화면에는 못 들어간다. 지사와 다른 화이트리스트를 따로
// 둔다 — 하나로 합치면 지사가 파일전달을, DB담당자가 다운로드를 볼 수 있게 된다.
const staffAllowedRoutes = ['/dashboard/file-transfer'];

// 다른 곳(lib/jwt, lib/csrf, 로그인)은 시크릿이 없으면 전부 throw한다.
// 여기만 기본값으로 넘어가면, 설정이 빠진 배포에서 누구나 알 수 있는 키로 서명한
// 토큰이 이 관문을 통과한다. 관문이 가장 먼저 막아야 할 상황이므로 같은 기준을 쓴다.
const secret = new TextEncoder().encode(
  process.env.JWT_SECRET ||
    (() => {
      throw new Error('JWT_SECRET environment variable is not set');
    })()
);

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // 공개 라우트는 허용
  if (publicRoutes.includes(pathname)) {
    return NextResponse.next();
  }

  // 공개 API는 허용
  if (publicApiRoutes.includes(pathname)) {
    return NextResponse.next();
  }

  // 토큰 확인 (쿠키 또는 Authorization 헤더)
  let token = request.cookies.get('authToken')?.value;

  if (!token) {
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }
  }

  if (!token) {
    // 페이지 요청이면 로그인 페이지로 리다이렉트
    if (!pathname.startsWith('/api/')) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    // API 요청이면 401 반환
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  /*
   * 루트로 들어오면 각자 첫 화면으로 보낸다.
   *
   * 관리자는 대시보드, DB담당자는 파일전달, 그 외(지사)는 파일 다운로드다.
   * 한 곳으로만 보내면 접근 못 하는 역할은 곧바로 한 번 더 튕긴다.
   */
  if (pathname === '/') {
    let role: string | undefined;

    try {
      const verified = await jwtVerify(token, secret);
      role = (verified.payload as { role?: string }).role;
    } catch {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    const target =
      role === 'admin' || role === 'subadmin'
        ? '/dashboard'
        : role === 'staff'
          ? '/dashboard/file-transfer'
          : '/dashboard/download';
    return NextResponse.redirect(new URL(target, request.url));
  }

  // 대시보드 페이지 접근 시 역할 기반 차단 (렌더링 전에 서버에서 처리)
  if (pathname.startsWith('/dashboard')) {
    let role: string | undefined;

    try {
      const verified = await jwtVerify(token, secret);
      role = (verified.payload as { role?: string }).role;
    } catch {
      // 토큰이 유효하지 않으면 로그인 페이지로
      return NextResponse.redirect(new URL('/login', request.url));
    }

    if (role === 'subadmin') {
      // 서브관리자는 사용자 관리 화면만 접근 불가
      if (pathname === '/dashboard/users' || pathname.startsWith('/dashboard/users/')) {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
    } else if (role !== 'admin') {
      // DB담당자는 파일전달 화면만, 그 외(지사)는 기존 화이트리스트를 그대로 쓴다.
      const allowedRoutes = role === 'staff' ? staffAllowedRoutes : userAllowedRoutes;
      const fallback = role === 'staff' ? '/dashboard/file-transfer' : '/dashboard/download';

      const isAllowed = allowedRoutes.some(
        (route) => pathname === route || pathname.startsWith(route + '/')
      );

      // 허용 목록에 없으면 각자의 기본 화면으로 (무한 리다이렉트 방지)
      if (!isAllowed) {
        return NextResponse.redirect(new URL(fallback, request.url));
      }
    }
  }

  // 토큰이 있으면 통과 (실제 검증은 API에서 수행)
  return NextResponse.next();
}

export const config = {
  matcher: [
    // 모든 라우트 보호 (정적 자산 제외)
    // public/ 아래 이미지·폰트도 제외한다. next/image가 원본을 가져올 때는
    // 브라우저 쿠키가 실리지 않아, 막아두면 로그인 전 로고가 깨진다.
    //
    // robots.txt 도 뺀다. 로봇은 로그인을 못 하므로 막아두면 "긁지 말라"는
    // 지시 자체를 못 읽는다. 안에 든 것은 전부 금지라 공개해도 새어 나갈 게 없다.
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:png|jpe?g|gif|svg|webp|avif|ico|woff2?)$).*)',
  ],
};
