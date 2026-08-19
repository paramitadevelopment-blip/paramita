'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AlertProvider } from './components/Alert/Alert';

// 로그아웃에서 캐시를 비워야 하므로 내보낸다. 안 비우면 같은 탭에서 계정을
// 갈아탔을 때 앞 사용자의 응답이 그대로 다음 사용자에게 보인다.
export const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AlertProvider>
        {children}
      </AlertProvider>
    </QueryClientProvider>
  );
}
