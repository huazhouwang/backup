/** Look libraries: a user's and shared libraries, their looks and versions, members */
import {
  DEFAULT_LIBRARY,
  LIBRARY_FORMAT,
  LIBRARY_FORMAT_VERSION,
  libraryRecipe,
  lookSizeOf,
  namesOf,
  normalizeRecipe,
  type LibraryLook,
  type LookLibrary,
  type Recipe,
} from '@plinth/core';
import type { LibraryLookInput, LibraryRole, LibrarySummary } from '@/shared/looks';
import { uiName } from '@/lib/i18n';
import { db, now, newId } from './db';

export async function listLibraries(userId: string): Promise<LibrarySummary[]> {
  const { results } = await db()
    .prepare(
      `select l.id, l.name, l.data as meta, m.role, u.name as owner_name, l.updated_at, (select count(*) from library_look k where k.library_id = l.id) as looks,
         (select json_array(k.look_id, k.name, k.data, k.version) from library_look k where k.library_id = l.id order by k.rowid limit 1) as first
       from look_library_member m join look_library l on l.id = m.library_id join "user" u on u.id = l.owner_id
       where m.user_id = ? order by l.updated_at desc limit 200`,
    )
    .bind(userId)
    .all<LibrarySummary & { meta: string; first: string | null }>();
  return results.map(({ meta, first, ...r }) => {
    if (!first) return r;
    const [look_id, name, data, version] = JSON.parse(first) as [string, string, string, number];
    const look = fileLook({ look_id, name, data, version }),
      lib = { id: r.id, materials: (JSON.parse(meta) as LibraryMeta).materials } as LookLibrary;
    return { ...r, cover: { recipe: libraryRecipe(lib, look), size: lookSizeOf(look) } };
  });
}

/** What a library file has besides its id, name and looks (look_library.data) */
export type LibraryMeta = Partial<Pick<LookLibrary, 'description' | 'version' | 'author' | 'license' | 'groups' | 'materials'>>;

interface LookRow {
  look_id: string;
  name: string;
  data: string;
  version: number;
}

/**
 * A stored look as the library file has it, at version <n>.0.0 (every save is a new version); looks saved before library files
 * ({ for, recipe, types }) and before recipes were scripts are converted as they are read
 */
function fileLook(row: LookRow): LibraryLook {
  const d = JSON.parse(row.data),
    version = `${row.version}.0.0`;
  if ('script' in d) return { ...d, name: d.name ?? namesOf(row.name), version };
  const r = normalizeRecipe(d.recipe) as Recipe;
  const [type, def] = (Object.entries(d.types ?? {})[0] ?? []) as [string?, { name: string; group?: string; size: { w: number; d: number; h: number } }?];
  const group = def?.group && Object.entries(DEFAULT_LIBRARY.groups ?? {}).find(([, g]) => g.name.zh === def.group || g.name.en === def.group)?.[0];
  return {
    name: namesOf(row.name),
    for: d.for,
    ...(type && def && d.for.includes(`furniture:${type}`) ? { newType: { name: namesOf(def.name), ...(group ? { group } : {}), size: def.size } } : {}),
    version,
    ...(r.params ? { params: r.params } : {}),
    ...(r.seed !== undefined ? { seed: r.seed } : {}),
    script: r.script,
  };
}

export async function createLibrary(userId: string, name: string, meta: LibraryMeta = {}) {
  const id = newId('lib'),
    t = now();
  await db().batch([
    db()
      .prepare('insert into look_library (id, owner_id, name, data, created_at, updated_at) values (?, ?, ?, ?, ?, ?)')
      .bind(id, userId, name, JSON.stringify(meta), t, t),
    db().prepare(`insert into look_library_member (library_id, user_id, role, created_at) values (?, ?, 'owner', ?)`).bind(id, userId, t),
  ]);
  return id;
}

export async function libraryRole(libraryId: string, userId: string) {
  const r = await db()
    .prepare('select role from look_library_member where library_id = ? and user_id = ?')
    .bind(libraryId, userId)
    .first<{ role: LibraryRole }>();
  return r?.role ?? null;
}

/** A user library as a library file, with its members */
export async function getLibrary(libraryId: string) {
  const lib = await db().prepare('select id, name, data from look_library where id = ?').bind(libraryId).first<{ id: string; name: string; data: string }>();
  if (!lib) return null;
  const [looks, members] = await Promise.all([
    db().prepare('select look_id, name, data, version from library_look where library_id = ? order by rowid').bind(libraryId).all<LookRow>(),
    db()
      .prepare(
        `select m.user_id, u.name, u.email, m.role from look_library_member m join "user" u on u.id = m.user_id where m.library_id = ? order by m.created_at`,
      )
      .bind(libraryId)
      .all<{ user_id: string; name: string; email: string; role: LibraryRole }>(),
  ]);
  const meta = JSON.parse(lib.data) as LibraryMeta;
  const library: LookLibrary = {
    format: LIBRARY_FORMAT,
    formatVersion: LIBRARY_FORMAT_VERSION,
    id: lib.id,
    name: namesOf(lib.name),
    ...meta,
    version: meta.version ?? '1.0.0',
    looks: Object.fromEntries(looks.results.map(r => [r.look_id, fileLook(r)])),
  };
  return { library, members: members.results };
}

/** Change what the library file has besides its looks (merged into what it has) */
export async function updateLibraryMeta(libraryId: string, change: (meta: LibraryMeta) => LibraryMeta) {
  const cur = await db().prepare('select data from look_library where id = ?').bind(libraryId).first<{ data: string }>();
  await db()
    .prepare('update look_library set data = ?, updated_at = ? where id = ?')
    .bind(JSON.stringify(change(JSON.parse(cur?.data ?? '{}'))), now(), libraryId)
    .run();
}

export const renameLibrary = (libraryId: string, name: string) =>
  db().prepare('update look_library set name = ?, updated_at = ? where id = ?').bind(name, now(), libraryId).run();
export const deleteLibrary = (libraryId: string) => db().prepare('delete from look_library where id = ?').bind(libraryId).run();

/** Save a look: a new one at version 1, an existing one at its next version; returns the version */
export async function putLibraryLook(libraryId: string, lookId: string, look: Omit<LibraryLookInput, 'materials'>, userId: string) {
  const name = uiName(look.name),
    data = look;
  const cur = await db().prepare('select version from library_look where library_id = ? and look_id = ?').bind(libraryId, lookId).first<{ version: number }>();
  const version = (cur?.version ?? 0) + 1,
    t = now();
  await db().batch([
    db()
      .prepare(
        `insert into library_look (library_id, look_id, name, data, version, updated_by, updated_at) values (?, ?, ?, ?, ?, ?, ?)
       on conflict (library_id, look_id) do update set name = excluded.name, data = excluded.data, version = excluded.version, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      )
      .bind(libraryId, lookId, name, JSON.stringify(data), version, userId, t),
    db().prepare('update look_library set updated_at = ? where id = ?').bind(t, libraryId),
  ]);
  return version;
}

export const deleteLibraryLook = (libraryId: string, lookId: string) =>
  db().prepare('delete from library_look where library_id = ? and look_id = ?').bind(libraryId, lookId).run();

export const userByEmail = (email: string) =>
  db().prepare('select id, name, email from "user" where lower(email) = ?').bind(email.toLowerCase()).first<{ id: string; name: string; email: string }>();

export const setLibraryMember = (libraryId: string, userId: string, role: LibraryRole) =>
  db()
    .prepare(`insert into look_library_member (library_id, user_id, role, created_at) values (?, ?, ?, ?)
    on conflict (library_id, user_id) do update set role = excluded.role where look_library_member.role != 'owner'`)
    .bind(libraryId, userId, role, now())
    .run();
export const removeLibraryMember = (libraryId: string, userId: string) =>
  db().prepare(`delete from look_library_member where library_id = ? and user_id = ? and role != 'owner'`).bind(libraryId, userId).run();

/** Current versions of looks, limited to the libraries this user can see (for "update available" in designs) */
export async function lookVersions(userId: string, refs: { library: string; look: string }[]) {
  if (!refs.length) return [];
  const where = refs.map(() => '(k.library_id = ? and k.look_id = ?)').join(' or ');
  const { results } = await db()
    .prepare(`select k.library_id as library, k.look_id as look, k.version, k.name, l.name as library_name from library_look k
      join look_library_member m on m.library_id = k.library_id and m.user_id = ? join look_library l on l.id = k.library_id where ${where}`)
    .bind(userId, ...refs.flatMap(r => [r.library, r.look]))
    .all<{ library: string; look: string; version: number; name: string; library_name: string }>();
  return results.map(r => ({ ...r, version: `${r.version}.0.0` }));
}
