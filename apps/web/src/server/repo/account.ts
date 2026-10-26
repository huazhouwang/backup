/** Account: the user's own canvas modules, and exporting a user's data */
import type { CanvasPage } from '@plinth/core';
import { m } from '@/lib/i18n';
import { db } from './db';
import { listApiKeys, listModels } from './models';
import { getLibrary } from './libraries';
import { getMyWidgets, getWidgetLibrary } from './widget-libraries';

/** The user's own canvas modules (issue 171), run in every design they open */
export async function getMyCanvas(userId: string): Promise<CanvasPage> {
  const r = await db().prepare('select canvas from user_pref where user_id = ?').bind(userId).first<{ canvas: string | null }>();
  return r?.canvas ? (JSON.parse(r.canvas) as CanvasPage) : { modules: [] };
}

export const putMyCanvas = (userId: string, page: CanvasPage) =>
  db()
    .prepare('insert into user_pref (user_id, canvas) values (?, ?) on conflict (user_id) do update set canvas = excluded.canvas')
    .bind(userId, JSON.stringify(page))
    .run();

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
  const { results: ownedWidgets } = await db().prepare('select id from widget_library where owner_id = ?').bind(userId).all<{ id: string }>();
  const widgetLibraries = await Promise.all(ownedWidgets.map(l => getWidgetLibrary(l.id)));
  return {
    exportedAt: new Date().toISOString(),
    user,
    projects: projects.map(p => ({ ...p, content: JSON.parse(p.content) })),
    comments,
    apiKeys: keys.map(({ key_hint, ...rest }) => ({ ...rest, key: m.server_export_key_withheld({ hint: key_hint }) })),
    models,
    lookLibraries: libraries.filter(Boolean).map(l => l!.library),
    widgetLibraries: widgetLibraries.filter(Boolean).map(l => l!.library),
    myWidgets: await getMyWidgets(userId),
    myCanvas: await getMyCanvas(userId),
  };
}
