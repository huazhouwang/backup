/** Comments on a project */
import type { CommentRow, CommentStatus } from '@/shared/comments';
import { db, now, newId } from './db';

export async function listComments(projectId: string) {
  const { results } = await db()
    .prepare(
      `select c.id, c.target_id, c.target_name, c.parent_id, c.author_id, u.name as author, c.body, c.status, c.created_at
       from comment c left join "user" u on u.id = c.author_id where c.project_id = ? order by c.created_at limit 1000`,
    )
    .bind(projectId)
    .all<CommentRow>();
  return results;
}

export async function addComment(
  projectId: string,
  userId: string,
  c: { targetId?: string | null; targetName?: string | null; parentId?: string | null; body: string; status?: CommentStatus },
) {
  const id = newId('m');
  await db()
    .prepare('insert into comment (id, project_id, target_id, target_name, parent_id, author_id, body, status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, projectId, c.targetId ?? null, c.targetName ?? null, c.parentId ?? null, userId, c.body, c.status ?? 'open', now())
    .run();
  return id;
}

export const setCommentStatus = (projectId: string, id: string, status: CommentStatus) =>
  db().prepare('update comment set status = ? where project_id = ? and id = ?').bind(status, projectId, id).run();
export const getComment = (projectId: string, id: string) =>
  db().prepare('select * from comment where project_id = ? and id = ?').bind(projectId, id).first<CommentRow>();
export const deleteComment = (projectId: string, id: string) => db().prepare('delete from comment where project_id = ? and id = ?').bind(projectId, id).run();
