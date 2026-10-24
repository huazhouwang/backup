/** What every API route shares: the request context, the signed-in user, rate limits, role checks and body parsing */
import { env } from 'cloudflare:workers';
import { type Context, type MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { m } from '@/lib/i18n';
import { can, type Role } from '@/shared/roles';
import { auth } from './auth';
import * as repo from './repo';

export type User = { id: string; name: string; email: string; isAnonymous?: boolean | null; image?: string | null };
export type Vars = { user: User | null };
export type AppEnv = { Variables: Vars };
export type C = Context<AppEnv>;

export const ip = (c: C) => c.req.header('cf-connecting-ip') ?? 'local';
/** Throw 429 when this key is over the binding's limit (no binding in local development: no limit) */
export async function limit(binding: RateLimit | undefined, key: string) {
  if (!binding) return;
  const { success } = await binding.limit({ key });
  if (!success) throw new HTTPException(429, { message: m.server_err_rate_limited() });
}

// Session: cached in a signed cookie, so most requests skip the database
export const session: MiddlewareHandler<{ Variables: Vars }> = async (c, next) => {
  const s = await auth().api.getSession({ headers: c.req.raw.headers });
  c.set('user', (s?.user as User) ?? null);
  await limit(env.RL_API, s?.user.id ?? ip(c));
  await next();
};

export const requireUser = (c: C) => {
  const u = c.get('user');
  if (!u) throw new HTTPException(401, { message: m.server_err_sign_in_required() });
  return u;
};

/** Routes under /projects/:id; each one declares the minimum role it needs with minRole() */
export type ProjectEnv = { Variables: Vars & { projectId: string; role: Role } };

/** Let only project members with at least this role through (404 for non-members, 403 for too low a role) */
export const minRole =
  (min: Role): MiddlewareHandler<ProjectEnv> =>
  async (c, next) => {
    const id = c.req.param('id')!;
    const role = await repo.getRole(id, c.get('user')?.id ?? null);
    if (!can(role, min)) throw new HTTPException(role ? 403 : 404, { message: role ? m.server_err_forbidden() : m.server_err_project_not_accessible() });
    c.set('projectId', id);
    c.set('role', role!);
    await next();
  };

export const body = async <T extends z.ZodType>(c: Pick<Context, 'req'>, schema: T): Promise<z.output<T>> => {
  const parsed = schema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw new HTTPException(400, { message: z.prettifyError(parsed.error) });
  return parsed.data;
};

export const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    throw new HTTPException(400, { message: m.server_err_invalid_json() });
  }
};
