/** Widget libraries: built-in and users' own, their widgets and members (like look libraries, ./libraries.ts) */
import {
  BUILTIN_WIDGET_LIBRARIES,
  libraryCanvasModuleSchema,
  myWidgetsSchema,
  parseWidgetLibrary,
  widgetDefSchema,
  WIDGETLIB_FORMAT,
  WIDGETLIB_FORMAT_VERSION,
  type WidgetLibrary,
} from '@opensu/core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { m, uiName } from '@/lib/i18n';
import type { LibraryRole } from '@/shared/looks';
import type { WidgetLibraryDetail, WidgetLibrarySummary } from '@/shared/widgets';
import * as repo from '../repo';
import { body, requireUser, type AppEnv, type C } from '../http';

export const routes = new Hono<AppEnv>();

const builtin = (id: string) => BUILTIN_WIDGET_LIBRARIES.find(l => l.id === id);
const WIDGET_ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

/** The library and the caller's role in it, if at least `min` (404 for non-members, 403 for too low a role); built-in ones are read-only */
async function access(c: C, min: LibraryRole) {
  const u = requireUser(c),
    id = c.req.param('lib')!;
  const role = builtin(id) ? 'viewer' : await repo.widgetLibraryRole(id, u.id);
  const rank = { viewer: 0, editor: 1, owner: 2 };
  if (!role || rank[role] < rank[min])
    throw new HTTPException(role ? 403 : 404, { message: role ? m.server_err_forbidden() : m.server_err_widget_library_not_found() });
  return { id, role, user: u };
}

const fileProblem = (e: unknown) =>
  new HTTPException(400, { message: m.server_err_widget_library_file({ problem: e instanceof Error ? e.message : String(e) }) });

routes.get('/widget-libraries', async c => {
  const builtins: WidgetLibrarySummary[] = BUILTIN_WIDGET_LIBRARIES.map(l => ({
    id: l.id,
    name: uiName(l.name),
    role: 'viewer',
    owner_name: l.author ?? 'OpenSU',
    widgets: Object.keys(l.widgets).length,
    updated_at: 0,
    builtin: true,
  }));
  return c.json([...builtins, ...(await repo.listWidgetLibraries(requireUser(c).id))]);
});

/** The user's own and shared libraries as files, for the editor */
routes.get('/widget-libraries/files', async c => c.json(await repo.widgetLibraryFiles(requireUser(c).id)));

routes.post('/widget-libraries', async c => {
  const u = requireUser(c);
  const b = await body(c, z.object({ name: z.string().min(1).max(80) }));
  const id = await repo.createWidgetLibrary(u.id, {
    format: WIDGETLIB_FORMAT,
    formatVersion: WIDGETLIB_FORMAT_VERSION,
    name: { zh: b.name, en: b.name },
    version: '1.0.0',
    widgets: {},
  });
  return c.json({ id });
});

/** Import a library file as a new library of the caller's, keeping its widgets' ids and versions */
routes.post('/widget-libraries/import', async c => {
  const u = requireUser(c);
  const b = await body(c, z.object({ file: z.unknown() }));
  let file: WidgetLibrary;
  try {
    file = parseWidgetLibrary(b.file);
  } catch (e) {
    throw fileProblem(e);
  }
  const { $schema: _s, id: _id, ...rest } = file;
  return c.json({ id: await repo.createWidgetLibrary(u.id, rest) });
});

routes.get('/widget-libraries/:lib', async c => {
  const { id, role } = await access(c, 'viewer');
  const b = builtin(id);
  if (b) return c.json({ library: b, role: 'viewer', builtin: true, members: [] } satisfies WidgetLibraryDetail);
  const lib = await repo.getWidgetLibrary(id);
  if (!lib) throw new HTTPException(404, { message: m.server_err_widget_library_not_found() });
  return c.json({ ...lib, role } satisfies WidgetLibraryDetail);
});

routes.patch('/widget-libraries/:lib', async c => {
  const { id } = await access(c, 'owner');
  const b = await body(c, z.object({ name: z.string().min(1).max(80) }));
  const lib = (await repo.getWidgetLibrary(id))!.library;
  await repo.putWidgetLibrary({ ...lib, name: { zh: b.name, en: b.name } });
  return c.json({ ok: true });
});

routes.delete('/widget-libraries/:lib', async c => {
  const { id } = await access(c, 'owner');
  await repo.deleteWidgetLibrary(id);
  return c.json({ ok: true });
});

/** Save a widget: a new one, or a new version (a changed widget always gets a higher version) */
routes.put('/widget-libraries/:lib/widgets/:widget', async c => {
  const { id } = await access(c, 'editor');
  const widget = c.req.param('widget');
  if (!WIDGET_ID.test(widget)) throw fileProblem(`widget id ${widget}`);
  const b = await body(c, z.object({ def: z.unknown() }));
  const def = widgetDefSchema.safeParse(b.def);
  if (!def.success) throw fileProblem(def.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
  const lib = (await repo.getWidgetLibrary(id))!.library;
  const saved = repo.withWidget(lib, widget, def.data);
  if (saved !== lib) await repo.putWidgetLibrary(saved);
  return c.json({ widget, version: saved.widgets[widget].version });
});

routes.delete('/widget-libraries/:lib/widgets/:widget', async c => {
  const { id } = await access(c, 'editor');
  const lib = (await repo.getWidgetLibrary(id))!.library;
  const { [c.req.param('widget')]: _gone, ...widgets } = lib.widgets;
  await repo.putWidgetLibrary({ ...lib, widgets });
  return c.json({ ok: true });
});

/**
 * Publish a canvas module as a wheel (issue 171): a new one, or a new version when its source changed. Body: { name, description?,
 * source }; the library keeps the version.
 */
routes.put('/widget-libraries/:lib/canvas-modules/:module', async c => {
  const { id } = await access(c, 'editor');
  const module = c.req.param('module');
  if (!WIDGET_ID.test(module)) throw fileProblem(`canvas module id ${module}`);
  const lib = (await repo.getWidgetLibrary(id))!.library;
  const old = lib.canvasModules?.[module];
  const b = await c.req.json().catch(() => null);
  const next = libraryCanvasModuleSchema.safeParse({ ...b, version: old ? old.version + (old.source === b?.source ? 0 : 1) : 1 });
  if (!next.success) throw fileProblem(next.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
  await repo.putWidgetLibrary({ ...lib, canvasModules: { ...lib.canvasModules, [module]: next.data } });
  return c.json({ library: id, module, version: next.data.version });
});

routes.delete('/widget-libraries/:lib/canvas-modules/:module', async c => {
  const { id } = await access(c, 'editor');
  const lib = (await repo.getWidgetLibrary(id))!.library;
  const { [c.req.param('module')]: _gone, ...canvasModules } = lib.canvasModules ?? {};
  await repo.putWidgetLibrary({ ...lib, canvasModules });
  return c.json({ ok: true });
});

/** Share with someone who has an account, as a viewer (installs its widgets) or an editor (also adds and changes them) */
routes.post('/widget-libraries/:lib/members', async c => {
  const { id } = await access(c, 'owner');
  const b = await body(c, z.object({ email: z.email(), role: z.enum(['viewer', 'editor']) }));
  const target = await repo.userByEmail(b.email);
  if (!target) throw new HTTPException(404, { message: m.server_err_library_no_user({ email: b.email }) });
  await repo.setWidgetLibraryMember(id, target.id, b.role);
  return c.json({ ok: true });
});

routes.delete('/widget-libraries/:lib/members/:userId', async c => {
  const { id, role, user } = await access(c, 'viewer');
  // The owner removes others; anyone can leave, except a built-in library
  if ((c.req.param('userId') !== user.id && role !== 'owner') || builtin(id)) throw new HTTPException(403, { message: m.server_err_forbidden() });
  await repo.removeWidgetLibraryMember(id, c.req.param('userId'));
  return c.json({ ok: true });
});

/** The user's own widgets ("for me"), drawn in every design they open */
routes.get('/me/widgets', async c => c.json(await repo.getMyWidgets(requireUser(c).id)));

routes.put('/me/widgets', async c => {
  const u = requireUser(c);
  const set = myWidgetsSchema.safeParse(await c.req.json().catch(() => null));
  if (!set.success) throw fileProblem(set.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
  await repo.putMyWidgets(u.id, set.data);
  return c.json({ ok: true });
});
