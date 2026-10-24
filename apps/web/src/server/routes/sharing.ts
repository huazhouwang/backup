/** Sharing: opening a share link and joining its project; under /projects/:id members, share links and invites */
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { m } from '@/lib/i18n';
import * as repo from '../repo';
import { can, SHARE_ROLES } from '@/shared/roles';
import { body, minRole, requireUser, type AppEnv, type ProjectEnv } from '../http';

export const routes = new Hono<AppEnv>();
/** Mounted under /projects/:id */
export const projectRoutes = new Hono<ProjectEnv>();

routes.get('/share/:token', async c => {
  const link = await repo.getShareLink(c.req.param('token'));
  if (!link) throw new HTTPException(404, { message: m.server_err_link_expired() });
  return c.json({ projectId: link.project_id, name: link.name, role: link.role });
});

routes.post('/share/:token/accept', async c => {
  const u = requireUser(c);
  const link = await repo.getShareLink(c.req.param('token'));
  if (!link) throw new HTTPException(404, { message: m.server_err_link_expired() });
  const role = await repo.upsertMember(link.project_id, u.id, link.role);
  return c.json({ projectId: link.project_id, role });
});

const zShareRole = z.enum(SHARE_ROLES);

projectRoutes.get('/sharing', minRole('viewer'), async c => {
  const id = c.var.projectId;
  const role = c.var.role;
  const [members, links, invites] = await Promise.all([
    repo.listMembers(id),
    role === 'owner' ? repo.listShareLinks(id) : [],
    role === 'owner' ? repo.listInvites(id) : [],
  ]);
  return c.json({ members, links, invites });
});

projectRoutes.post('/links', minRole('owner'), async c => {
  const id = c.var.projectId;
  const user = c.var.user!;
  const b = await body(c, z.object({ role: zShareRole }));
  return c.json({ token: await repo.createShareLink(id, b.role, user.id) });
});

projectRoutes.delete('/links/:token', minRole('owner'), async c => {
  const id = c.var.projectId;
  await repo.revokeShareLink(id, c.req.param('token'));
  return c.json({ ok: true });
});

projectRoutes.post('/invites', minRole('owner'), async c => {
  const id = c.var.projectId;
  const user = c.var.user!;
  const b = await body(c, z.object({ email: z.email(), role: zShareRole }));
  return c.json({ id: await repo.createInvite(id, b.email, b.role, user.id) });
});

projectRoutes.delete('/invites/:inviteId', minRole('owner'), async c => {
  const id = c.var.projectId;
  await repo.deleteInvite(id, c.req.param('inviteId'));
  return c.json({ ok: true });
});

projectRoutes.patch('/members/:userId', minRole('owner'), async c => {
  const id = c.var.projectId;
  const b = await body(c, z.object({ role: zShareRole }));
  await repo.setMemberRole(id, c.req.param('userId'), b.role);
  return c.json({ ok: true });
});

projectRoutes.delete('/members/:userId', minRole('viewer'), async c => {
  const id = c.var.projectId;
  const user = c.var.user!;
  const target = c.req.param('userId');
  // The owner can remove others; anyone can leave
  if (target !== user.id && !can(c.var.role, 'owner')) throw new HTTPException(403, { message: m.server_err_forbidden() });
  await repo.removeMember(id, target);
  return c.json({ ok: true });
});
