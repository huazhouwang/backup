/**
 * Server API (Hono). Pages are served by the static assets layer; only /api/* comes here. This file wires the app together:
 * errors, auth, the session, and the routes by resource (./routes), each project route under /projects/:id behind its role
 * check (see http.ts).
 */
import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { m } from '@/lib/i18n';
import { auth } from './auth';
import { ip, limit, session, type AppEnv } from './http';
import * as account from './routes/account';
import * as agent from './routes/agent';
import * as comments from './routes/comments';
import * as libraries from './routes/libraries';
import * as models from './routes/models';
import * as projects from './routes/projects';
import * as sharing from './routes/sharing';

export const api = new Hono<AppEnv>().basePath('/api');

api.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: m.server_err_internal() }, 500);
});

// Auth: rate-limit OTP sending and sign-in endpoints
api.on(['GET', 'POST'], '/auth/*', async c => {
  if (c.req.method === 'POST' && /email-otp|sign-in|sign-up/.test(c.req.path)) await limit(env.RL_AUTH, ip(c));
  return auth().handler(c.req.raw);
});

api.use('/*', session);

for (const r of [account.routes, projects.routes, sharing.routes, models.routes, libraries.routes]) api.route('/', r);
for (const r of [projects.projectRoutes, sharing.projectRoutes, comments.projectRoutes, models.projectRoutes, agent.projectRoutes])
  api.route('/projects/:id', r);

api.notFound(c => c.json({ error: m.server_err_api_not_found() }, 404));
