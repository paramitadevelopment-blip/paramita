import { create } from 'zustand';

export interface User {
  id: number;
  username: string;
  name: string;
  role: 'admin' | 'user';
  department?: string;
}

interface AuthState {
  user: User | null;
  csrfToken: string;
  setUser: (user: User | null) => void;
  setCsrfToken: (token: string) => void;
  logout: () => Promise<void>;
  initializeFromStorage: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  csrfToken: '',

  setUser: (user) => {
    set({ user });
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    } else {
      localStorage.removeItem('user');
    }
  },

  setCsrfToken: (token) => {
    set({ csrfToken: token });
  },

  logout: async () => {
    // httpOnly 쿠키는 JS로 지울 수 없으므로 서버에 만료를 요청한다.
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (error) {
      console.error('Logout request failed:', error);
    }

    set({ user: null, csrfToken: '' });
    localStorage.removeItem('user');
  },

  initializeFromStorage: () => {
    const storedUser = localStorage.getItem('user');

    if (storedUser) {
      try {
        set({ user: JSON.parse(storedUser) });
      } catch {
        localStorage.removeItem('user');
      }
    }

    const token = readCookie('csrfToken');
    if (token) {
      set({ csrfToken: token });
    }
  },
}));

function readCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
}

// CSRF 토큰의 원본은 서버가 심은 쿠키다.
// 스토어는 캐시일 뿐이므로 비어 있으면 쿠키에서 복구한다.
export function getCsrfToken(): string {
  const cached = useAuthStore.getState().csrfToken;
  if (cached) return cached;

  const token = readCookie('csrfToken');
  if (token) {
    useAuthStore.setState({ csrfToken: token });
  }
  return token;
}
