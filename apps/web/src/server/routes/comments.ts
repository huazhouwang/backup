/** Comments on a project under /projects/:id */
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { m } from '@/lib/i18n';
import * as repo from '../repo';
import { COMMENT_STATUSES } from '@/shared/comments';
import { body, minRole, type ProjectEnv } from '../http';

/** Mounted under /projects/:id */
export const projectRoutes = new Hono<ProjectEnv>();

projectRoutes.get('/comments', minRole('viewer'), async c => {
  const id = c.var.projectId;
  return c.json(await repo.listComments(id));
});

projectRoutes.post('/comments', minRole('commenter'), async c => {
  const id = c.var.projectId;
  const user = c.var.user!;
  const b = await body(
    c,
    z.object({
      body: z.string().trim().min(1).max(2000),
      targetId: z.string().max(100).nullish(),
      targetName: z.string().max(100).nullish(),
      parentId: z.string().max(40).nullish(),
      status: z.enum(['open', 'pending-confirm']).optional(),
    }),
  );
  return c.json({ id: await repo.addComment(id, user.id, b) });
});

projectRoutes.patch('/comments/:cid', minRole('commenter'), async c => {
  const id = c.var.projectId;
  const b = await body(c, z.object({ status: z.enum(COMMENT_STATUSES) }));
  await repo.setCommentStatus(id, c.req.param('cid'), b.status);
  return c.json({ ok: true });
});

projectRoutes.delete('/comments/:cid', minRole('commenter'), async c => {
  const id = c.var.projectId;
  const user = c.var.user!;
  const role = c.var.role;
  const cm = await repo.getComment(id, c.req.param('cid'));
  if (!cm) throw new HTTPException(404, { message: m.server_err_comment_not_found() });
  if (cm.author_id !== user.id && role !== 'owner') throw new HTTPException(403, { message: m.server_err_comment_delete_own_only() });
  await repo.deleteComment(id, cm.id);
  return c.json({ ok: true });
});
