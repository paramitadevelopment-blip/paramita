import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ success: true });

  // httpOnly 쿠키는 JS로 지울 수 없으므로 서버가 만료시킨다.
  response.cookies.set('authToken', '', { maxAge: 0, path: '/' });
  response.cookies.set('csrfToken', '', { maxAge: 0, path: '/' });

  return response;
}
