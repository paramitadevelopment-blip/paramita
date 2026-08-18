import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';
import { getUserFromRequest } from './jwt';

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  throw new Error('JWT_SECRET environment variable is not set');
})() as string;

interface CsrfTokenPayload {
  userId: number;
  nonce: string;
}

export function verifyCsrfToken(request: NextRequest): boolean {
  const csrfToken = request.headers.get('x-csrf-token');

  if (!csrfToken) {
    return false;
  }

  try {
    // 토큰 검증
    const decoded = jwt.verify(csrfToken, JWT_SECRET) as CsrfTokenPayload;

    // 현재 사용자 확인
    const user = getUserFromRequest(request);
    if (!user) {
      return false;
    }

    // CSRF 토큰의 userId와 현재 사용자의 ID가 일치하는지 확인
    if (decoded.userId !== user.id) {
      console.warn(`CSRF mismatch: token userId=${decoded.userId}, request userId=${user.id}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error('CSRF verification error:', error);
    return false;
  }
}
