'use client'

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { useAuthStore, getCsrfToken } from '@/app/store/authStore';
import { getLandingRoute } from '@/lib/roles';
import styles from "./login.module.css";
import Image from 'next/image';
import { useAlert } from '@/app/components/Alert/Alert';

// 토큰은 응답 본문이 아니라 Set-Cookie로 내려온다.
interface LoginResponse {
  success: boolean;
  user: {
    id: number;
    username: string;
    name: string;
    role: string;
  };
}

async function loginAPI(username: string, password: string): Promise<LoginResponse> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '로그인 실패');
  }

  return response.json();
}

export default function LoginPage() {
  const { showAlert } = useAlert();
  const router = useRouter();
  const setUser = useAuthStore((state) => state.setUser);
  const setCsrfToken = useAuthStore((state) => state.setCsrfToken);
  const [formData, setFormData] = useState({ userId: '', password: '', rememberMe: false });

  // 서버/클라이언트 초기 렌더 결과를 동일하게 유지하기 위해
  // localStorage 값은 마운트 이후(클라이언트 전용)에 반영한다.
  useEffect(() => {
    const savedUserId = localStorage.getItem('savedUserId');
    const savedRemember = localStorage.getItem('rememberMe');
    if (savedUserId && savedRemember === 'true') {
      setFormData((prev) => ({ ...prev, userId: savedUserId, rememberMe: true }));
    }
  }, []);

  const loginMutation = useMutation({
    mutationFn: () => loginAPI(formData.userId, formData.password),
    onSuccess: (data) => {
      // Zustand 스토어에 사용자 정보 저장
      setUser(data.user as any);
      // CSRF 토큰은 서버가 쿠키로 심었으므로 거기서 읽어 스토어에 채운다.
      setCsrfToken(getCsrfToken());

      // 아이디 저장 설정
      if (formData.rememberMe) {
        localStorage.setItem('savedUserId', formData.userId);
        localStorage.setItem('rememberMe', 'true');
      } else {
        localStorage.removeItem('savedUserId');
        localStorage.removeItem('rememberMe');
      }

      /*
       * 쿠키는 서버에서 Set-Cookie로 이미 저장됨 (httpOnly).
       *
       * proxy.ts의 역할별 첫 화면과 반드시 같아야 한다. 여기서 다른 곳으로
       * 보내면 미들웨어가 그 자리에서 다시 튕기는데, 그 과정에서 이미 시작된
       * RSC 스트림이 중간에 끊겨 서버에 "Cannot write to a CLOSED writable
       * stream" 에러가 남는다.
       */
      router.push(getLandingRoute(data.user.role));
    },
    onError: (error: Error) => {
      // 로그인 실패 시 아이디 저장 체크 상태에 따라 처리
      if (formData.rememberMe) {
        localStorage.setItem('savedUserId', formData.userId);
        localStorage.setItem('rememberMe', 'true');
      } else {
        localStorage.removeItem('savedUserId');
        localStorage.removeItem('rememberMe');
      }

      setFormData(prev => ({ ...prev, password: '' }));
      showAlert({
        type: 'error',
        title: '로그인 실패',
        message: error.message,
      });
    },
  });

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!formData.userId || !formData.password) {
      showAlert({
        type: 'warning',
        title: '입력 오류',
        message: '아이디와 비밀번호를 입력해주세요.',
      });
      return;
    }

    loginMutation.mutate();
  };

  return (
    <section className={styles.loginWrap}>
      <div className={styles.loginContainer}>
        <div className={styles.titleWrap}>
          <Image src="/logo/logo.png" alt="logo" width={300} height={100} priority style={{ width: 'auto', height: '80px' }} />
        </div>

        <form onSubmit={handleLogin} className={styles.formWrap} method="post" action="#">
          <div className={styles.formGroup}>
            <label htmlFor="userId">아이디</label>
            <input
              type="text"
              id="userId"
              name="userId"
              placeholder="아이디를 입력하세요"
              value={formData.userId}
              onChange={(e) => setFormData(prev => ({ ...prev, userId: e.target.value }))}
              disabled={loginMutation.isPending}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="password">비밀번호</label>
            <input
              type="password"
              id="password"
              name="password"
              placeholder="비밀번호를 입력하세요"
              value={formData.password}
              onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
              disabled={loginMutation.isPending}
            />
          </div>

          <div className={styles.checkboxGroup}>
            <input
              type="checkbox"
              id="rememberMe"
              name="rememberMe"
              checked={formData.rememberMe}
              onChange={(e) => setFormData(prev => ({ ...prev, rememberMe: e.target.checked }))}
              disabled={loginMutation.isPending}
            />
            <label htmlFor="rememberMe">아이디 저장</label>
          </div>
          <button type="submit" className={styles.loginBtn} disabled={loginMutation.isPending}>
            {loginMutation.isPending ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </section>
  );
}
