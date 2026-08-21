import { NextRequest, NextResponse } from 'next/server';
import { verifyCsrfToken } from '@/lib/csrf';

export async function POST(request: NextRequest) {
  // 남의 사이트에서 보낸 요청으로 강제로 로그아웃당하지 않게 막는다.
  // 데이터가 새는 건 아니지만, 쓰던 작업이 끊기는 건 사용자에게 실제 피해다.
  if (!verifyCsrfToken(request)) {
    return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
  }

  const response = NextResponse.json({ success: true });

  // httpOnly 쿠키는 JS로 지울 수 없으므로 서버가 만료시킨다.
  response.cookies.set('authToken', '', { maxAge: 0, path: '/' });
  response.cookies.set('csrfToken', '', { maxAge: 0, path: '/' });

  return response;
}
