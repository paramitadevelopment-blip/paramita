'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/app/store/authStore';
import { useAuthCheck } from '@/app/hooks/useAuthCheck';
import Spinner from '@/app/components/Spinner/Spinner';
import Sidebar from '@/app/components/Sidebar/Sidebar';
import styles from './layout.module.css';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const logout = useAuthStore((state) => state.logout);

  const {
    data: authUser,
    isLoading: isInitializing,
    isError: isAuthError,
  } = useAuthCheck();

  useEffect(() => {
    if (authUser) {
      setUser(authUser);
    }
  }, [authUser, setUser]);

  useEffect(() => {
    if (isAuthError) {
      logout().finally(() => router.push('/login'));
    }
  }, [isAuthError, logout, router]);

  if (isInitializing || !user) {
    return <Spinner isLoading={true} />;
  }

  return (
    <div className={styles.dashboardContainer}>
      <Sidebar />
      <main className={styles.mainContent}>
        {children}
      </main>
    </div>
  );
}
