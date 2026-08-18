import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  throw new Error('JWT_SECRET environment variable is not set');
})() as string;

export const HISTORY_COOKIE = 'fileHistoryAccess';

// 히스토리 접근 티켓은 짧게 유지한다. 만료되면 비밀번호를 다시 받는다.
const TICKET_TTL_SECONDS = 30 * 60;

interface HistoryTicket {
  scope: 'fileHistory';
  userId: number;
}

export function issueHistoryTicket(userId: number): string {
  const payload: HistoryTicket = { scope: 'fileHistory', userId };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TICKET_TTL_SECONDS });
}

// 비밀번호를 통과한 티켓인지 확인한다.
// 티켓은 발급받은 본인에게만 유효하다.
export function hasHistoryAccess(request: NextRequest, userId: number): boolean {
  const token = request.cookies.get(HISTORY_COOKIE)?.value;
  if (!token) return false;

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as HistoryTicket;
    return decoded.scope === 'fileHistory' && decoded.userId === userId;
  } catch {
    return false;
  }
}

export function getHistoryCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: (process.env.NODE_ENV === 'production' ? 'strict' : 'lax') as 'strict' | 'lax',
    path: '/',
    maxAge: TICKET_TTL_SECONDS,
  };
}
