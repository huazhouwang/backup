/**
 * Share pages (issue 196): the owner publishes a design with its style renders under a revocable link; anyone with the link sees
 * the page (the images on it, the model in 3D, storeys and area) and can remix the house into a design of their own.
 */
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { m } from '@/lib/i18n';
import { renderImageUrl } from '@/shared/renders';
import { stored } from '../content';
import * as repo from '../repo';
import { body, minRole, requireUser, type AppEnv, type ProjectEnv } from '../http';

export const routes = new Hono<AppEnv>();
/** Mounted under /projects/:id */
export const projectRoutes = new Hono<ProjectEnv>();

projectRoutes.get('/showcase', minRole('viewer'), async c => c.json(await repo.showcaseOf(c.var.projectId)));

projectRoutes.post('/showcase', minRole('owner'), async c => c.json(await repo.publishShowcase(c.var.projectId, c.var.user!.id)));

projectRoutes.patch('/showcase', minRole('owner'), async c => {
  const b = await body(c, z.object({ hero: z.string().max(40).nullable() }));
  await repo.setShowcaseHero(c.var.projectId, b.hero);
  return c.json({ ok: true });
});

projectRoutes.delete('/showcase', minRole('owner'), async c => {
  await repo.unpublishShowcase(c.var.projectId);
  return c.json({ ok: true });
});

/** A published design as the page shows it */
async function published(token: string) {
  const s = await repo.getShowcase(token);
  const p = s && (await repo.getProject(s.project_id));
  const v = p && (await repo.getVersion(p.id));
  if (!s || !p || !v) throw new HTTPException(404, { message: m.server_err_link_expired() });
  const renders = await repo.publicRenders(p.id);
  const hero = renders.find(r => r.id === s.hero) ?? renders.find(r => r.shot === 'aerial') ?? renders[0] ?? null;
  return { showcase: s, name: p.name, project: stored(v.content), renders, hero };
}

routes.get('/showcase/:token', async c => {
  const { name, project, renders, hero } = await published(c.req.param('token'));
  return c.json({ name, project, renders, hero: hero?.id ?? null });
});

/** The link preview's image: the hero render, or the 3D view it came from when the render isn't a photo format */
routes.get('/showcase/:token/preview', async c => {
  const { hero } = await published(c.req.param('token'));
  if (!hero) throw new HTTPException(404, { message: m.server_err_render_not_found() });
  const img = await repo.renderImage(hero.id, 'image');
  return c.redirect(renderImageUrl(hero.id, img?.url.startsWith('data:image/svg') ? 'source' : 'image'));
});

/** Remix: a copy of the published design, as the visitor's own (guests too) */
routes.post('/showcase/:token/remix', async c => {
  const u = requireUser(c);
  const { name, project } = await published(c.req.param('token'));
  const id = repo.newId('p');
  const title = m.showcase_remix_name({ name }).slice(0, 60);
  await repo.createProject(u.id, id, title, JSON.stringify({ ...project, id, name: title }), m.server_version_remix({ name }));
  return c.json({ id });
});
