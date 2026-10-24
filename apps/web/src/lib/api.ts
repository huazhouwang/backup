/** Thin client wrapper for /api: shared JSON handling and error messages */
import type { Role } from '@/shared/roles';
import { m } from './i18n';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: any,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...rest,
    headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? m.api_request_failed({ status: res.status }), data);
  return data as T;
}

const ROLE_LABEL: Record<Role, () => string> = { owner: m.role_owner, editor: m.role_editor, commenter: m.role_commenter, viewer: m.role_viewer };
export const roleLabel = (r: Role) => ROLE_LABEL[r]();

export interface Me {
  user: { id: string; name: string; email: string; isAnonymous?: boolean | null; image?: string | null } | null;
  googleEnabled: boolean;
  mailEnabled: boolean;
}
