/** Account: who is signed in (accepting their pending invites), their own canvas modules, and exporting their data */
import { canvasPageSchema } from '@plinth/core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { googleEnabled } from '../auth';
import { mailEnabled } from '../mail';
import * as repo from '../repo';
import { requireUser, type AppEnv } from '../http';

export const routes = new Hono<AppEnv>();

routes.get('/me', async c => {
  const u = c.get('user');
  if (u && !u.isAnonymous) await repo.acceptInvites(u.id, u.email);
  return c.json({ user: u, googleEnabled: googleEnabled(), mailEnabled: mailEnabled() });
});

routes.get('/account/export', async c => {
  const u = requireUser(c);
  const data = await repo.exportUserData(u.id);
  return c.json(data, 200, { 'Content-Disposition': `attachment; filename="plinth-export-${new Date().toISOString().slice(0, 10)}.json"` });
});

/** The user's own canvas modules (issue 171): added for themselves, run in every design they open */
routes.get('/me/canvas', async c => c.json(await repo.getMyCanvas(requireUser(c).id)));

routes.put('/me/canvas', async c => {
  const u = requireUser(c);
  const page = canvasPageSchema.safeParse(await c.req.json().catch(() => null));
  if (!page.success) throw new HTTPException(400, { message: page.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') });
  await repo.putMyCanvas(u.id, page.data);
  return c.json({ ok: true });
});
