/** Members, share links and invites */
import { ROLE_RANK, type Role } from '@/shared/roles';
import { db, now, newId } from './db';
import { getRole } from './projects';

export async function listMembers(projectId: string) {
  const { results } = await db()
    .prepare(
      `select m.user_id, m.role, u.name, u.email, u.image, coalesce(u."isAnonymous", 0) as anonymous from project_member m join "user" u on u.id = m.user_id
       where m.project_id = ? order by m.created_at`,
    )
    .bind(projectId)
    .all<{ user_id: string; role: Role; name: string; email: string; image: string | null; anonymous: number }>();
  return results;
}

/** Add a member or upgrade their role (never downgrade) */
export async function upsertMember(projectId: string, userId: string, role: Role) {
  const cur = await getRole(projectId, userId);
  if (cur && ROLE_RANK[cur] >= ROLE_RANK[role]) return cur;
  await db()
    .prepare(
      'insert into project_member (project_id, user_id, role, created_at) values (?, ?, ?, ?) on conflict (project_id, user_id) do update set role = excluded.role',
    )
    .bind(projectId, userId, role, now())
    .run();
  return role;
}

export const setMemberRole = (projectId: string, userId: string, role: Role) =>
  db().prepare(`update project_member set role = ? where project_id = ? and user_id = ? and role != 'owner'`).bind(role, projectId, userId).run();
export const removeMember = (projectId: string, userId: string) =>
  db().prepare(`delete from project_member where project_id = ? and user_id = ? and role != 'owner'`).bind(projectId, userId).run();

export async function createShareLink(projectId: string, role: Role, userId: string) {
  const token = newId('s') + newId();
  await db()
    .prepare('insert into share_link (token, project_id, role, created_by, created_at) values (?, ?, ?, ?, ?)')
    .bind(token, projectId, role, userId, now())
    .run();
  return token;
}

export async function listShareLinks(projectId: string) {
  const { results } = await db()
    .prepare('select token, role, created_at from share_link where project_id = ? and revoked_at is null order by created_at desc')
    .bind(projectId)
    .all<{ token: string; role: Role; created_at: number }>();
  return results;
}

export const revokeShareLink = (projectId: string, token: string) =>
  db().prepare('update share_link set revoked_at = ? where project_id = ? and token = ?').bind(now(), projectId, token).run();

export const getShareLink = (token: string) =>
  db()
    .prepare('select s.token, s.project_id, s.role, p.name from share_link s join project p on p.id = s.project_id where s.token = ? and s.revoked_at is null')
    .bind(token)
    .first<{ token: string; project_id: string; role: Role; name: string }>();

export async function createInvite(projectId: string, email: string, role: Role, userId: string) {
  const id = newId('i');
  await db()
    .prepare('insert into invite (id, project_id, email, role, created_by, created_at) values (?, ?, ?, ?, ?, ?)')
    .bind(id, projectId, email.toLowerCase(), role, userId, now())
    .run();
  return id;
}

export async function listInvites(projectId: string) {
  const { results } = await db()
    .prepare('select id, email, role, created_at from invite where project_id = ? and accepted_at is null order by created_at desc')
    .bind(projectId)
    .all<{ id: string; email: string; role: Role; created_at: number }>();
  return results;
}

export const deleteInvite = (projectId: string, id: string) => db().prepare('delete from invite where project_id = ? and id = ?').bind(projectId, id).run();

/** After sign-in: redeem invites sent to this email */
export async function acceptInvites(userId: string, email: string) {
  const { results } = await db()
    .prepare('select id, project_id, role from invite where email = ? and accepted_at is null')
    .bind(email.toLowerCase())
    .all<{ id: string; project_id: string; role: Role }>();
  for (const inv of results) {
    await upsertMember(inv.project_id, userId, inv.role);
    await db().prepare('update invite set accepted_at = ? where id = ?').bind(now(), inv.id).run();
  }
  return results.length;
}

/** When an anonymous user signs in to a real account, transfer everything they own */
export async function transferOwnership(from: string, to: string) {
  await db().batch([
    db().prepare('update project set owner_id = ? where owner_id = ?').bind(to, from),
    db().prepare('update or ignore project_member set user_id = ? where user_id = ?').bind(to, from),
    db().prepare('update api_key set user_id = ? where user_id = ?').bind(to, from),
    db().prepare('update model_config set user_id = ? where user_id = ?').bind(to, from),
    db().prepare('update or ignore user_pref set user_id = ? where user_id = ?').bind(to, from),
    db().prepare('update or ignore chat_thread set user_id = ? where user_id = ?').bind(to, from),
    db().prepare('update comment set author_id = ? where author_id = ?').bind(to, from),
    db().prepare('update project_version set author_id = ? where author_id = ?').bind(to, from),
    db().prepare('update usage set user_id = ? where user_id = ?').bind(to, from),
  ]);
}
