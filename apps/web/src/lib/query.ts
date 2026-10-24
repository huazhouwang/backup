import { QueryClient, useQuery } from '@tanstack/react-query';
import { api, type Me } from './api';

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
});

export const useMe = () => useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/me') });

export const fmtArea = (n: number) => `${n.toFixed(1)} m²`;
export const fmtTime = (t: number) => {
  const d = new Date(t),
    now = new Date();
  const same = d.toDateString() === now.toDateString();
  return same ? d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
};
