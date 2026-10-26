/** Widget libraries: a user's own and shared ones, each stored as its library file, and their members */
import { WIDGETLIB_FORMAT, WIDGETLIB_FORMAT_VERSION, type MyWidgets, type WidgetDef, type WidgetLibrary } from '@plinth/core';
import type { LibraryRole } from '@/shared/looks';
import type { WidgetLibrarySummary } from '@/shared/widgets';
import { uiName } from '@/lib/i18n';
import { db, newId, now } from './db';

interface Row {
  id: string;
  owner_id: string;
  name: string;
  data: string;
  role: LibraryRole;
  owner_name: string;
  updated_at: number;
}

const ROWS = `select l.id, l.owner_id, l.name, l.data, m.role, u.name as owner_name, l.updated_at
  from widget_library_member m join widget_library l on l.id = m.library_id join "user" u on u.id = l.owner_id`;

/** The file a row keeps, with the row's id (and name, should the file lack one) */
const fileOf = (r: Pick<Row, 'id' | 'name' | 'data'>): WidgetLibrary => {
  const d = JSON.parse(r.data) as WidgetLibrary;
  return { ...d, format: WIDGETLIB_FORMAT, formatVersion: WIDGETLIB_FORMAT_VERSION, id: r.id, name: d.name ?? { zh: r.name } };
};

async function memberRows(userId: string) {
  const { results } = await db().prepare(`${ROWS} where m.user_id = ? order by l.updated_at desc limit 200`).bind(userId).all<Row>();
  return results;
}

export async function listWidgetLibraries(userId: string): Promise<WidgetLibrarySummary[]> {
  return (await memberRows(userId)).map(r => {
    const file = fileOf(r);
    return { id: r.id, name: r.name, role: r.role, owner_name: r.owner_name, widgets: Object.keys(file.widgets).length, updated_at: r.updated_at };
  });
}

/** Every widget library the user can use, as files with who owns them (the editor makes their widgets installable) */
export async function widgetLibraryFiles(userId: string) {
  return (await memberRows(userId)).map(r => ({ owner: r.owner_id, role: r.role, library: fileOf(r) }));
}

export async function createWidgetLibrary(userId: string, file: Omit<WidgetLibrary, 'id'>) {
  const id = newId('wlib'),
    t = now();
  await db().batch([
    db()
      .prepare('insert into widget_library (id, owner_id, name, data, created_at, updated_at) values (?, ?, ?, ?, ?, ?)')
      .bind(id, userId, uiName(file.name), JSON.stringify({ ...file, id }), t, t),
    db().prepare(`insert into widget_library_member (library_id, user_id, role, created_at) values (?, ?, 'owner', ?)`).bind(id, userId, t),
  ]);
  return id;
}

export async function widgetLibraryRole(libraryId: string, userId: string) {
  const r = await db()
    .prepare('select role from widget_library_member where library_id = ? and user_id = ?')
    .bind(libraryId, userId)
    .first<{ role: LibraryRole }>();
  return r?.role ?? null;
}

export async function getWidgetLibrary(libraryId: string) {
  const row = await db().prepare('select id, name, data from widget_library where id = ?').bind(libraryId).first<Pick<Row, 'id' | 'name' | 'data'>>();
  if (!row) return null;
  const members = await db()
    .prepare(
      `select m.user_id, u.name, u.email, m.role from widget_library_member m join "user" u on u.id = m.user_id where m.library_id = ? order by m.created_at`,
    )
    .bind(libraryId)
    .all<{ user_id: string; name: string; email: string; role: LibraryRole }>();
  return { library: fileOf(row), members: members.results };
}

/** Write a library's file (its name column follows the file's name) */
export async function putWidgetLibrary(file: WidgetLibrary) {
  await db()
    .prepare('update widget_library set name = ?, data = ?, updated_at = ? where id = ?')
    .bind(uiName(file.name), JSON.stringify(file), now(), file.id)
    .run();
}

export const deleteWidgetLibrary = (libraryId: string) => db().prepare('delete from widget_library where id = ?').bind(libraryId).run();

export const setWidgetLibraryMember = (libraryId: string, userId: string, role: LibraryRole) =>
  db()
    .prepare(`insert into widget_library_member (library_id, user_id, role, created_at) values (?, ?, ?, ?)
    on conflict (library_id, user_id) do update set role = excluded.role where widget_library_member.role != 'owner'`)
    .bind(libraryId, userId, role, now())
    .run();
export const removeWidgetLibraryMember = (libraryId: string, userId: string) =>
  db().prepare(`delete from widget_library_member where library_id = ? and user_id = ? and role != 'owner'`).bind(libraryId, userId).run();

const semver = (v: string) => v.split(/[.+-]/).slice(0, 3).map(Number);
const newer = (a: string, b: string) => {
  const [x, y] = [semver(a), semver(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};
const nextPatch = (v: string) => {
  const [a, b, c] = semver(v);
  return `${a}.${b}.${c + 1}`;
};

/**
 * A widget as saved into a library: a changed widget gets a version above the one it replaces (its own, when that is already
 * higher), so designs that copied it are offered the update; an unchanged one keeps its version
 */
export function versioned(old: WidgetDef | undefined, def: WidgetDef): WidgetDef {
  if (!old) return def;
  const same = JSON.stringify({ ...old, version: '' }) === JSON.stringify({ ...def, version: '' });
  if (same) return old;
  return { ...def, version: newer(def.version, old.version) ? def.version : nextPatch(old.version) };
}

/** The library with a widget saved (a new one, or a new version), its own version moved on */
export function withWidget(file: WidgetLibrary, id: string, def: WidgetDef): WidgetLibrary {
  const saved = versioned(file.widgets[id], def);
  if (saved === file.widgets[id]) return file;
  return { ...file, version: nextPatch(file.version), widgets: { ...file.widgets, [id]: saved } };
}

/** The user's own widgets ("for me"), empty when they have none */
export async function getMyWidgets(userId: string): Promise<MyWidgets> {
  const r = await db().prepare('select widgets from user_pref where user_id = ?').bind(userId).first<{ widgets: string | null }>();
  return r?.widgets ? (JSON.parse(r.widgets) as MyWidgets) : { widgets: [] };
}

export const putMyWidgets = (userId: string, set: MyWidgets) =>
  db()
    .prepare('insert into user_pref (user_id, widgets) values (?, ?) on conflict (user_id) do update set widgets = excluded.widgets')
    .bind(userId, JSON.stringify(set))
    .run();
