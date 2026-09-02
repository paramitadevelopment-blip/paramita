import { NextRequest, NextResponse } from 'next/server';
import { canManageFiles } from '@/lib/roles';
import { timingSafeEqual } from 'crypto';
import { getUserFromRequest } from '@/lib/jwt';
import { verifyCsrfToken } from '@/lib/csrf';
import {
  issueHistoryTicket,
  hasHistoryAccess,
  getHistoryCookieOptions,
  HISTORY_COOKIE,
} from '@/lib/historyAccess';

// 현재 접근 권한이 살아있는지 확인한다. (페이지 진입 시 사용)
export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!canManageFiles(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({ hasAccess: hasHistoryAccess(request, user.id) });
}

// 비밀번호를 검증하고 통과하면 접근 티켓을 발급한다.
export async function POST(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!canManageFiles(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!verifyCsrfToken(request)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const expected = process.env.FILE_HISTORY_PASSWORD;
    if (!expected) {
      console.error('FILE_HISTORY_PASSWORD is not set');
      return NextResponse.json({ error: '서버 설정이 올바르지 않습니다.' }, { status: 500 });
    }

    const { password } = await request.json();

    if (typeof password !== 'string') {
      return NextResponse.json({ error: '비밀번호가 올바르지 않습니다.' }, { status: 401 });
    }

    try {
      if (!timingSafeEqual(Buffer.from(password), Buffer.from(expected))) {
        return NextResponse.json({ error: '비밀번호가 올바르지 않습니다.' }, { status: 401 });
      }
    } catch {
      return NextResponse.json({ error: '비밀번호가 올바르지 않습니다.' }, { status: 401 });
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set(HISTORY_COOKIE, issueHistoryTicket(user.id), getHistoryCookieOptions());

    return response;
  } catch (error) {
    console.error('History access verify error:', error);
    return NextResponse.json({ error: '확인에 실패했습니다.' }, { status: 500 });
  }
}

// 파일삭제 히스토리 로그아웃
export async function DELETE(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!canManageFiles(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!verifyCsrfToken(request)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const response = NextResponse.json({ success: true });
    response.cookies.delete(HISTORY_COOKIE);

    return response;
  } catch (error) {
    console.error('History access logout error:', error);
    return NextResponse.json({ error: '로그아웃에 실패했습니다.' }, { status: 500 });
  }
}
