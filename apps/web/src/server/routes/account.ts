/** Account: who is signed in (accepting their pending invites) and exporting their data */
import { Hono } from 'hono';
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
