import { QueryClient } from '@tanstack/react-query';
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10000, refetchOnWindowFocus: true } },
});
export async function api<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.message || body?.errors?.[0]?.message || `HTTP ${res.status}`);
  return body;
}
export const post = <T = any>(url: string, body: unknown = {}, token?: string) =>
  api<T>(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
export const base = (id: string) => `/api/projects/${encodeURIComponent(id)}`;
export const format = (v: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(v);
export const time = (s: string) =>
  new Date(s).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
export function navigate(page: string, params?: Record<string, string>) {
  location.hash = '/' + page + (params ? '?' + new URLSearchParams(params) : '');
}
