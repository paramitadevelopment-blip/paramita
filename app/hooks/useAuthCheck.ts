import { useQuery } from '@tanstack/react-query';
import { getCsrfToken } from '@/app/store/authStore';

export function useAuthCheck() {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const response = await fetch('/api/auth/me', {
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Unauthorized');

      const data = await response.json();
      return data.user;
    },
    retry: false,
  });
}
