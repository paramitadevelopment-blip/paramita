import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { canManageUsers, getAllowedDashboardRoutes, getLandingRoute } from '@/lib/roles';

const publicRoutes = ['/login'];
const publicApiRoutes = ['/api/auth/login'];

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

    return NextResponse.redirect(new URL(getLandingRoute(role), request.url));
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

    // 사용자 관리는 관리자만 쓴다. 관리자급인 서브관리자도 여기서 걸린다 —
    // 아래 화이트리스트는 관리자급을 아예 안 보므로 이 검사를 먼저 해야 한다.
    const isUsersRoute =
      pathname === '/dashboard/users' || pathname.startsWith('/dashboard/users/');
    if (isUsersRoute && !canManageUsers(role)) {
      return NextResponse.redirect(new URL(getLandingRoute(role), request.url));
    }

    // 관리자급은 나머지 화면에 제한이 없다(null). 그 외는 역할별 화이트리스트를 본다.
    const allowedRoutes = getAllowedDashboardRoutes(role);
    if (allowedRoutes) {
      const isAllowed = allowedRoutes.some(
        (route) => pathname === route || pathname.startsWith(route + '/')
      );

      // 허용 목록에 없으면 각자의 기본 화면으로 (무한 리다이렉트 방지)
      if (!isAllowed) {
        return NextResponse.redirect(new URL(getLandingRoute(role), request.url));
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
