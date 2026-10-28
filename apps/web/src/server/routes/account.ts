/** Account: who is signed in (accepting their pending invites), their own canvas modules, and exporting their data */
import { canvasPageSchema } from '@opensu/core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { googleEnabled } from '../auth';
import { mailEnabled } from '../mail';
import { creditState, periodStart } from '../platform';
import * as repo from '../repo';
import { EVENTS } from '@/shared/events';
import { requireUser, type AppEnv } from '../http';

export const routes = new Hono<AppEnv>();

routes.get('/me', async c => {
  const u = c.get('user');
  if (u && !u.isAnonymous) await repo.acceptInvites(u.id, u.email);
  return c.json({ user: u, googleEnabled: googleEnabled(), mailEnabled: mailEnabled() });
});

/** The user's free credits on the platform's model (issue 185) */
routes.get('/me/credits', async c => {
  const u = requireUser(c);
  const guest = !!u.isAnonymous;
  return c.json(creditState(guest, await repo.creditsSpent(u.id, periodStart(guest))));
});

/** A funnel event from the app (issue 188): known names only, the project only if the user may see it */
routes.post('/events', async c => {
  const u = requireUser(c);
  const b = (await c.req.json().catch(() => null)) as { name?: string; projectId?: string; detail?: string } | null;
  if (!b || !(EVENTS as readonly string[]).includes(b.name ?? '')) throw new HTTPException(400, { message: 'unknown event' });
  const project = b.projectId && (await repo.getRole(b.projectId, u.id)) ? b.projectId : null;
  await repo.recordEvent(b.name!, u.id, project, typeof b.detail === 'string' ? b.detail.slice(0, 200) : null);
  return c.json({ ok: true });
});

routes.get('/account/export', async c => {
  const u = requireUser(c);
  const data = await repo.exportUserData(u.id);
  return c.json(data, 200, { 'Content-Disposition': `attachment; filename="opensu-export-${new Date().toISOString().slice(0, 10)}.json"` });
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
