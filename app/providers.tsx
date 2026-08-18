'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AlertProvider } from './components/Alert/Alert';

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AlertProvider>
        {children}
      </AlertProvider>
    </QueryClientProvider>
  );
}
