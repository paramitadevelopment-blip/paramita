import { useQuery } from '@tanstack/react-query';

interface CheckUsernameResponse {
  available: boolean;
  username: string;
  reason?: string;
}

export function useCheckUsername(username: string | null, enabled: boolean = true) {
  return useQuery({
    queryKey: ['checkUsername', username],
    queryFn: async () => {
      if (!username) return null;

      const response = await fetch(`/api/users/check-username?username=${encodeURIComponent(username)}`);
      if (!response.ok) throw new Error('Failed to check username');
      return response.json() as Promise<CheckUsernameResponse>;
    },
    enabled: enabled && !!username && username.length >= 3,
    staleTime: 1000 * 60 * 5, // 5분
    gcTime: 1000 * 60 * 10, // 10분
    retry: 1,
  });
}
