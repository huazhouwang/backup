/** Projects: the list and creating one; under /projects/:id a project's content, name, thumbnail and versions */
import { createProject as newProjectData, type Project } from '@plinth/core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import sample from '../../../../../samples/wushi-10/project.json';
import { getLocale, m } from '@/lib/i18n';
import * as repo from '../repo';
import { can } from '@/shared/roles';
import { body, minRole, parseJson, requireUser, type AppEnv, type ProjectEnv } from '../http';
import { checkContent, checkStructure, MAX_CONTENT, stored } from '../content';

export const routes = new Hono<AppEnv>();
/** Mounted under /projects/:id */
export const projectRoutes = new Hono<ProjectEnv>();

routes.get('/projects', async c => c.json(await repo.listProjects(requireUser(c).id)));

routes.post('/projects', async c => {
  const u = requireUser(c);
  const b = await body(
    c,
    z.object({
      name: z.string().trim().min(1).max(60),
      template: z.enum(['blank', 'sample']).default('blank'),
      floors: z.number().int().min(1).max(6).default(1),
    }),
  );
  const id = repo.newId('p');
  const data: Project =
    b.template === 'sample'
      ? { ...(structuredClone(sample) as unknown as Project), id, name: b.name }
      : newProjectData({ id, name: b.name, floors: b.floors, language: getLocale() === 'en' ? 'en' : 'zh' });
  await repo.createProject(u.id, id, b.name, JSON.stringify(data), b.template === 'sample' ? m.server_version_from_sample() : m.server_version_blank());
  return c.json({ id });
});

projectRoutes.get('/', minRole('viewer'), async c => {
  const id = c.var.projectId;
  const role = c.var.role;
  const [p, v] = await Promise.all([repo.getProject(id), repo.getVersion(id)]);
  if (!p || !v) throw new HTTPException(404, { message: m.server_err_project_not_found() });
  // Editors chat with the owner's models; everyone else doesn't need the list
  const models = can(role, 'editor') ? await repo.listModels(p.owner_id) : [];
  return c.json({
    id: p.id,
    name: p.name,
    role,
    version: v.version,
    ownerId: p.owner_id,
    models: models.map(x => ({ id: x.id, label: x.label, provider: x.provider, model: x.model })),
    projectModelId: models.some(x => x.id === p.model_config_id) ? p.model_config_id : null,
    defaultModelId: models.length ? await repo.defaultModelId(p.owner_id, models) : null,
    content: stored(v.content),
  });
});

projectRoutes.put('/', minRole('editor'), async c => {
  const id = c.var.projectId;
  const user = c.var.user!;
  const raw = await c.req.text();
  if (raw.length > MAX_CONTENT) throw new HTTPException(413, { message: m.server_err_project_too_large() });
  const parsed = z
    .object({
      base: z.number().int(),
      summary: z
        .string()
        .max(200)
        .default(() => m.server_version_saved()),
      content: z.unknown(),
      /** A deliberate save (e.g. restoring a version) that must not absorb the version before it */
      checkpoint: z.boolean().optional(),
    })
    .safeParse(parseJson(raw));
  if (!parsed.success) throw new HTTPException(400, { message: z.prettifyError(parsed.error) });
  const b = parsed.data;
  const content = checkContent(b.content);
  await checkStructure(id, b.base, content);
  const version = await repo.saveVersion(id, user.id, b.base, JSON.stringify(content), b.summary, { name: content.name, checkpoint: b.checkpoint });
  if (!version) {
    const head = await repo.getVersion(id);
    return c.json({ error: m.server_err_save_conflict(), conflict: true, version: head?.version, content: head && stored(head.content) }, 409);
  }
  return c.json({ version });
});

projectRoutes.patch('/', minRole('editor'), async c => {
  const id = c.var.projectId;
  const b = await body(c, z.object({ name: z.string().trim().min(1).max(60) }));
  await repo.renameProject(id, b.name);
  return c.json({ ok: true });
});

projectRoutes.delete('/', minRole('owner'), async c => {
  const id = c.var.projectId;
  await repo.deleteProject(id);
  return c.json({ ok: true });
});

projectRoutes.put('/thumbnail', minRole('editor'), async c => {
  const id = c.var.projectId;
  // The plan as SVG, or a still of the house in 3D as a JPEG data URL
  const image = await c.req.text();
  if (image.length > 300_000 || !(image.startsWith('<svg') || /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(image)))
    throw new HTTPException(400, { message: m.server_err_invalid_thumbnail() });
  await repo.setThumbnail(id, image);
  return c.json({ ok: true });
});

projectRoutes.get('/versions', minRole('viewer'), async c => {
  const id = c.var.projectId;
  return c.json(await repo.listVersions(id));
});

projectRoutes.get('/versions/:v', minRole('viewer'), async c => {
  const id = c.var.projectId;
  const v = await repo.getVersion(id, Number(c.req.param('v')));
  if (!v) throw new HTTPException(404, { message: m.server_err_version_not_found() });
  return c.json({ ...v, content: stored(v.content) });
});
