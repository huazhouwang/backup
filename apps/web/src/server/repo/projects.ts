/** Projects: their rows, versions (autosaves squashed into one version per author and window), thumbnails, pinned model */
import { m } from '@/lib/i18n';
import { type Role } from '@/shared/roles';
import { db, now } from './db';

export interface ProjectRow {
  id: string;
  name: string;
  owner_id: string;
  head_version: number;
  model_config_id: string | null;
  thumbnail: string | null;
  created_at: number;
  updated_at: number;
}

export async function listProjects(userId: string) {
  const { results } = await db()
    .prepare(
      `select p.id, p.name, p.head_version, p.thumbnail, p.updated_at, m.role, u.name as owner_name
       from project_member m join project p on p.id = m.project_id join "user" u on u.id = p.owner_id
       where m.user_id = ? order by p.updated_at desc limit 200`,
    )
    .bind(userId)
    .all<{ id: string; name: string; head_version: number; thumbnail: string | null; updated_at: number; role: Role; owner_name: string }>();
  return results;
}

export async function createProject(userId: string, id: string, name: string, content: string, summary = m.server_version_created()) {
  const t = now();
  await db().batch([
    db().prepare('insert into project (id, name, owner_id, head_version, created_at, updated_at) values (?, ?, ?, 1, ?, ?)').bind(id, name, userId, t, t),
    db()
      .prepare('insert into project_version (project_id, version, content, author_id, summary, created_at) values (?, 1, ?, ?, ?, ?)')
      .bind(id, content, userId, summary, t),
    db().prepare(`insert into project_member (project_id, user_id, role, created_at) values (?, ?, 'owner', ?)`).bind(id, userId, t),
  ]);
}

export const getProject = (id: string) => db().prepare('select * from project where id = ?').bind(id).first<ProjectRow>();

export async function getRole(projectId: string, userId: string | null): Promise<Role | null> {
  if (!userId) return null;
  const r = await db().prepare('select role from project_member where project_id = ? and user_id = ?').bind(projectId, userId).first<{ role: Role }>();
  return r?.role ?? null;
}

export async function getVersion(projectId: string, version?: number) {
  const q = version
    ? db().prepare('select version, content, summary, created_at from project_version where project_id = ? and version = ?').bind(projectId, version)
    : db()
        .prepare(
          'select v.version, v.content, v.summary, v.created_at from project p join project_version v on v.project_id = p.id and v.version = p.head_version where p.id = ?',
        )
        .bind(projectId);
  return q.first<{ version: number; content: string; summary: string | null; created_at: number }>();
}

/** Autosaves by the same author are merged into one version while they keep coming within this long of the first one */
export const SQUASH_WINDOW = 10 * 60_000;

/**
 * Save a new version with optimistic concurrency: returns null when base is not the latest version (someone saved first).
 * When the latest version is the same author's own recent autosave, it is replaced instead of kept: the new row gets the next
 * version number (so concurrent editors still see a conflict) and the previous row is deleted, with its summary carried over.
 * Version 1 (the starting point) and the version before a checkpoint (a restore) are always kept.
 */
export async function saveVersion(
  projectId: string,
  userId: string,
  base: number,
  content: string,
  summary: string,
  o: { name?: string; checkpoint?: boolean } = {},
) {
  const t = now();
  const prev =
    o.checkpoint || base <= 1
      ? null
      : await db()
          .prepare('select author_id, summary, created_at, started_at from project_version where project_id = ? and version = ?')
          .bind(projectId, base)
          .first<{ author_id: string | null; summary: string | null; created_at: number; started_at: number | null }>();
  const startedAt = prev?.started_at ?? prev?.created_at;
  const squash = !!prev && prev.author_id === userId && startedAt != null && t - startedAt < SQUASH_WINDOW;
  const merged = squash ? joinSummaries(prev.summary, summary) : summary;
  const [upd] = await db().batch([
    db()
      .prepare('update project set head_version = head_version + 1, updated_at = ?, name = coalesce(?, name) where id = ? and head_version = ?')
      .bind(t, o.name ?? null, projectId, base),
    db()
      .prepare(
        `insert into project_version (project_id, version, content, author_id, summary, created_at, started_at)
         select id, head_version, ?, ?, ?, ?, ? from project where id = ? and head_version = ? and updated_at = ?`,
      )
      .bind(content, userId, merged, t, squash ? startedAt : null, projectId, base + 1, t),
    // Only when the insert above happened (no conflict)
    ...(squash
      ? [
          db()
            .prepare(
              'delete from project_version where project_id = ? and version = ? and exists (select 1 from project_version where project_id = ? and version = ? and created_at = ?)',
            )
            .bind(projectId, base, projectId, base + 1, t),
        ]
      : []),
  ]);
  return upd.meta.changes ? base + 1 : null;
}

/** "A; B" of two version summaries, each a list of changes, kept within the summary length limit */
function joinSummaries(a: string | null, b: string) {
  const joined = a ? `${a}${m.store_summary_separator()}${b}` : b;
  return joined.length > 200 ? `${joined.slice(0, 199)}…` : joined;
}

export async function listVersions(projectId: string) {
  const { results } = await db()
    .prepare(
      `select v.version, v.summary, v.created_at, u.name as author from project_version v left join "user" u on u.id = v.author_id
       where v.project_id = ? order by v.version desc limit 200`,
    )
    .bind(projectId)
    .all<{ version: number; summary: string | null; created_at: number; author: string | null }>();
  return results;
}

export const renameProject = (id: string, name: string) => db().prepare('update project set name = ?, updated_at = ? where id = ?').bind(name, now(), id).run();
export const setThumbnail = (id: string, svg: string) => db().prepare('update project set thumbnail = ? where id = ?').bind(svg, id).run();
export const deleteProject = (id: string) => db().prepare('delete from project where id = ?').bind(id).run();
export const setProjectModel = (id: string, modelConfigId: string | null) =>
  db().prepare('update project set model_config_id = ? where id = ?').bind(modelConfigId, id).run();
