/** Look libraries: built-in and user libraries, their looks and members */
import { DEFAULT_LIBRARY, parseLibrary, type LookLibrary } from '@plinth/core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { m, uiName } from '@/lib/i18n';
import { builtinDetail, builtinSummaries, builtinVersions, isBuiltinLibrary } from '../builtin-libraries';
import * as repo from '../repo';
import type { LibraryDetail, LibraryLookInput, LibraryRole } from '@/shared/looks';
import { body, requireUser, type AppEnv, type C } from '../http';
import { checkLibraryLook, parseLook, saveLook, zLibraryLook } from '../library-looks';

export const routes = new Hono<AppEnv>();

/** The library and the caller's role in it, if at least `min` (404 for non-members, 403 for too low a role); built-in libraries are read-only */
async function libraryAccess(c: C, min: LibraryRole) {
  const u = requireUser(c),
    id = c.req.param('lib')!;
  const role = isBuiltinLibrary(id) ? 'viewer' : await repo.libraryRole(id, u.id);
  const rank = { viewer: 0, editor: 1, owner: 2 };
  if (!role || rank[role] < rank[min])
    throw new HTTPException(role ? 403 : 404, { message: role ? m.server_err_forbidden() : m.server_err_library_not_found() });
  return { id, role, user: u };
}

// Built-in libraries first (the default set leads), then the user's own and shared ones
routes.get('/libraries', async c => c.json([...builtinSummaries(), ...(await repo.listLibraries(requireUser(c).id))]));

routes.post('/libraries', async c => {
  const u = requireUser(c);
  const b = await body(c, z.object({ name: z.string().min(1).max(80) }));
  return c.json({ id: await repo.createLibrary(u.id, b.name) });
});

/** Import a library file as a new library of the caller's, keeping its looks' ids */
routes.post('/libraries/import', async c => {
  const u = requireUser(c);
  const b = await body(c, z.object({ file: z.unknown() }));
  let file: LookLibrary;
  try {
    file = parseLibrary(b.file, DEFAULT_LIBRARY);
  } catch (e) {
    throw new HTTPException(400, { message: m.server_err_library_file({ problem: e instanceof Error ? e.message : String(e) }) });
  }
  const looks = Object.entries(file.looks).map(([k, look]) => [k, { ...look, version: undefined }] as const);
  for (const [, look] of looks) await checkLibraryLook(look as LibraryLookInput, file.materials);
  const { description, version, author, license, groups, materials } = file;
  const id = await repo.createLibrary(u.id, uiName(file.name), JSON.parse(JSON.stringify({ description, version, author, license, groups, materials })));
  for (const [k, { version: _v, ...look }] of looks) await repo.putLibraryLook(id, k, look, u.id);
  return c.json({ id });
});

routes.post('/libraries/versions', async c => {
  const u = requireUser(c);
  const b = await body(c, z.object({ refs: z.array(z.object({ library: z.string(), look: z.string() })).max(100) }));
  return c.json([...(await repo.lookVersions(u.id, b.refs)), ...builtinVersions(b.refs)]);
});

routes.get('/libraries/:lib', async c => {
  const { id, role } = await libraryAccess(c, 'viewer');
  const builtin = builtinDetail(id);
  if (builtin) return c.json(builtin);
  const lib = await repo.getLibrary(id);
  if (!lib) throw new HTTPException(404, { message: m.server_err_library_not_found() });
  return c.json({ ...lib, role } satisfies LibraryDetail);
});

routes.patch('/libraries/:lib', async c => {
  const { id } = await libraryAccess(c, 'owner');
  const b = await body(c, z.object({ name: z.string().min(1).max(80) }));
  await repo.renameLibrary(id, b.name);
  return c.json({ ok: true });
});

routes.delete('/libraries/:lib', async c => {
  const { id } = await libraryAccess(c, 'owner');
  await repo.deleteLibrary(id);
  return c.json({ ok: true });
});

/** Add a look (new id) */
routes.post('/libraries/:lib/looks', async c => {
  const { id, user } = await libraryAccess(c, 'editor');
  const look = parseLook(await body(c, zLibraryLook));
  await checkLibraryLook(look, (await repo.getLibrary(id))?.library.materials);
  const lookId = repo.newId('lk');
  const version = await saveLook(id, lookId, look, user.id);
  return c.json({ look: lookId, version: `${version}.0.0` });
});

/** Save a new version of a look */
routes.put('/libraries/:lib/looks/:look', async c => {
  const { id, user } = await libraryAccess(c, 'editor');
  const look = parseLook(await body(c, zLibraryLook));
  await checkLibraryLook(look, (await repo.getLibrary(id))?.library.materials);
  const version = await saveLook(id, c.req.param('look'), look, user.id);
  return c.json({ look: c.req.param('look'), version: `${version}.0.0` });
});

routes.delete('/libraries/:lib/looks/:look', async c => {
  const { id } = await libraryAccess(c, 'editor');
  await repo.deleteLibraryLook(id, c.req.param('look'));
  return c.json({ ok: true });
});

/** Share with someone who has an account, as a viewer (uses looks) or an editor (also adds and changes them) */
routes.post('/libraries/:lib/members', async c => {
  const { id } = await libraryAccess(c, 'owner');
  const b = await body(c, z.object({ email: z.email(), role: z.enum(['viewer', 'editor']) }));
  const target = await repo.userByEmail(b.email);
  if (!target) throw new HTTPException(404, { message: m.server_err_library_no_user({ email: b.email }) });
  await repo.setLibraryMember(id, target.id, b.role);
  return c.json({ ok: true });
});

routes.delete('/libraries/:lib/members/:userId', async c => {
  const { id, role, user } = await libraryAccess(c, 'viewer');
  // The owner removes others; anyone can leave, except a built-in library
  if ((c.req.param('userId') !== user.id && role !== 'owner') || isBuiltinLibrary(id)) throw new HTTPException(403, { message: m.server_err_forbidden() });
  await repo.removeLibraryMember(id, c.req.param('userId'));
  return c.json({ ok: true });
});

// Mounted last: Hono copies a sub-app's routes when it is mounted
