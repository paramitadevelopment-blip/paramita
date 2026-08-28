import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { extractDeviceInfo } from '@/lib/deviceInfo';
import {
  recordLogin,
  LOGIN_FAIL_NO_USER,
  LOGIN_FAIL_WRONG_PASSWORD,
} from '@/lib/loginRecord';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  throw new Error('JWT_SECRET environment variable is not set');
})() as string;

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    // 어디서 들어온 요청인지. 성공·실패 어느 쪽이든 기록에 함께 적는다.
    const device = extractDeviceInfo(request);

    if (!username || !password) {
      return NextResponse.json(
        { error: '사용자명과 비밀번호를 입력해주세요.' },
        { status: 400 }
      );
    }

    // 사용자 조회
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();

    if (error || !user) {
      console.error('Login failed: user not found', { username, error });
      await recordLogin(supabase, {
        username,
        success: false,
        failReason: LOGIN_FAIL_NO_USER,
        device,
      });
      return NextResponse.json(
        { error: '아이디 또는 비밀번호가 일치하지 않습니다.' },
        { status: 401 }
      );
    }

    // 비밀번호 확인
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      // 아이디는 맞고 비밀번호만 틀린 것과, 아이디 자체가 없는 것은 다른 신호다.
      // 화면에는 같은 문구를 보여주되(아이디 존재 여부를 흘리지 않는다) 기록은 나눈다.
      await recordLogin(supabase, {
        username,
        success: false,
        failReason: LOGIN_FAIL_WRONG_PASSWORD,
        user,
        device,
      });
      return NextResponse.json(
        { error: '아이디 또는 비밀번호가 일치하지 않습니다.' },
        { status: 401 }
      );
    }

    await recordLogin(supabase, { username, success: true, user, device });

    // JWT 토큰 생성
    const token = jwt.sign(
      { id: user.id, username: user.username, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // CSRF 토큰 생성: 사용자 ID를 바인드하여 다른 계정으로는 사용 불가능하게 함
    const csrfToken = jwt.sign(
      { userId: user.id, nonce: randomUUID() },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
      },
    });

    // httpOnly + Secure 쿠키로 세션 저장 (JS 접근 불가)
    // maxAge를 주지 않아 세션 쿠키로 발급 — 브라우저를 완전히 종료하면 함께 삭제된다.
    response.cookies.set('authToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      path: '/',
    });

    // CSRF 토큰은 클라이언트가 요청 헤더에 실어야 하므로 일반 쿠키
    response.cookies.set('csrfToken', csrfToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('로그인 오류:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
