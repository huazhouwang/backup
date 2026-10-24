/** Account: exporting a user's data */
import { m } from '@/lib/i18n';
import { db } from './db';
import { listApiKeys, listModels } from './models';
import { getLibrary } from './libraries';

/** Data export: account info + the latest version of each owned project */
export async function exportUserData(userId: string) {
  const user = await db().prepare('select id, name, email, "createdAt" from "user" where id = ?').bind(userId).first();
  const { results: projects } = await db()
    .prepare(
      `select p.id, p.name, p.created_at, p.updated_at, v.content from project p join project_version v on v.project_id = p.id and v.version = p.head_version where p.owner_id = ?`,
    )
    .bind(userId)
    .all<{ id: string; name: string; created_at: number; updated_at: number; content: string }>();
  const { results: comments } = await db().prepare('select project_id, target_name, body, created_at from comment where author_id = ?').bind(userId).all();
  const [keys, models] = await Promise.all([listApiKeys(userId), listModels(userId)]);
  const { results: owned } = await db().prepare('select id from look_library where owner_id = ?').bind(userId).all<{ id: string }>();
  const libraries = await Promise.all(owned.map(l => getLibrary(l.id)));
  return {
    exportedAt: new Date().toISOString(),
    user,
    projects: projects.map(p => ({ ...p, content: JSON.parse(p.content) })),
    comments,
    apiKeys: keys.map(({ key_hint, ...rest }) => ({ ...rest, key: m.server_export_key_withheld({ hint: key_hint }) })),
    models,
    lookLibraries: libraries.filter(Boolean).map(l => l!.library),
  };
}
