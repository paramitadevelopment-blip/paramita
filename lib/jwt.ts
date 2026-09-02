import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';
import type { Role } from '@/lib/roles';

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  throw new Error('JWT_SECRET environment variable is not set');
})() as string;

export interface TokenPayload {
  id: number;
  username: string;
  name: string;
  /**
   * 문자열이 아니라 Role로 좁혀 둔다. 그냥 string이면 'sudadmin' 같은 오타가
   * 타입 검사에 안 걸리고, 그 조건은 조용히 항상 false가 된다.
   */
  role: Role;
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
    return decoded;
  } catch (error) {
    return null;
  }
}

export function getTokenFromRequest(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  const cookie = request.cookies.get('authToken')?.value;
  return cookie || null;
}

export function getUserFromRequest(request: NextRequest): TokenPayload | null {
  const token = getTokenFromRequest(request);
  if (!token) return null;
  return verifyToken(token);
}
