/**
 * Style renders (issue 195): what the deployment's image provider needs, making an image of a shot in a style (charged in free
 * credits), listing, publishing and deleting a design's images, and serving them.
 */
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { m } from '@/lib/i18n';
import { can } from '@/shared/roles';
import { creditSettings, creditState, dayStart, periodStart } from '../platform';
import { renderProvider, RENDER_PASSES } from '../render';
import * as repo from '../repo';
import { body, minRole, type AppEnv, type ProjectEnv } from '../http';

export const routes = new Hono<AppEnv>();
/** Mounted under /projects/:id */
export const projectRoutes = new Hono<ProjectEnv>();

/** The provider's passes and price, so the client renders only what it needs */
routes.get('/render-config', c => {
  const p = renderProvider();
  return c.json({ provider: p.id, passes: p.passes, credits: p.credits, placeholder: p.id === 'placeholder' });
});

const IMAGE = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/;
const zPass = z.string().max(3_000_000).regex(IMAGE);
const zRender = z.object({
  style: z.string().max(64),
  styleName: z.string().min(1).max(100),
  palette: z
    .array(z.string().regex(/^#[0-9a-f]{6}$/))
    .min(2)
    .max(6),
  shot: z.string().max(100),
  shotName: z.string().min(1).max(100),
  prompt: z.string().min(1).max(4000),
  negative: z.string().max(2000),
  width: z.number().int().min(256).max(2048),
  height: z.number().int().min(256).max(2048),
  passes: z.object(Object.fromEntries(RENDER_PASSES.map(p => [p, zPass.optional()]))).refine(p => !!p.color, 'the colour pass is required'),
});

projectRoutes.get('/renders', minRole('viewer'), async c => c.json(await repo.listRenders(c.var.projectId)));

projectRoutes.post('/renders', minRole('editor'), async c => {
  const id = c.var.projectId;
  const user = c.var.user!;
  const b = await body(c, zRender);
  const provider = renderProvider();
  // Paid from the same free credits as the platform's model, under the same daily cap
  const guest = !!user.isAnonymous;
  const [spent, everyone] = await Promise.all([repo.creditsSpent(user.id, periodStart(guest)), repo.platformCreditsSpent(dayStart())]);
  if (creditState(guest, spent).balance < provider.credits)
    throw new HTTPException(402, { message: guest ? m.server_err_no_credits_guest() : m.server_err_no_credits() });
  if (everyone >= creditSettings().dailyCap) throw new HTTPException(503, { message: m.server_err_platform_busy() });
  const image = await provider.render({ ...b, passes: b.passes as Record<string, string> });
  await repo.recordUsage({ userId: user.id, projectId: id, modelConfigId: null, input: 0, output: 0, credits: provider.credits });
  // A published design's new images join its share page
  const row = await repo.addRender({
    public: (await repo.showcaseOf(id)) ? 1 : 0,
    project_id: id,
    user_id: user.id,
    style: b.style,
    style_name: b.styleName,
    shot: b.shot,
    shot_name: b.shotName,
    provider: provider.id,
    image,
    source: b.passes.color!,
  });
  return c.json(row);
});

projectRoutes.patch('/renders/:rid', minRole('editor'), async c => {
  const b = await body(c, z.object({ public: z.boolean() }));
  await repo.setRenderPublic(c.var.projectId, c.req.param('rid'), b.public);
  return c.json({ ok: true });
});

projectRoutes.delete('/renders/:rid', minRole('editor'), async c => {
  await repo.deleteRender(c.var.projectId, c.req.param('rid'));
  return c.json({ ok: true });
});

/** An image (or the pass it started from): for the design's members, or anyone while it is on the design's share page */
routes.get('/renders/:rid/:which{image|source}', async c => {
  const r = await repo.getRender(c.req.param('rid'));
  const role = r && (await repo.getRole(r.project_id, c.get('user')?.id ?? null));
  const shown = !!r?.public && !!(await repo.showcaseOf(r.project_id));
  if (!r || (!shown && !can(role ?? null, 'viewer'))) throw new HTTPException(404, { message: m.server_err_render_not_found() });
  const img = await repo.renderImage(r.id, c.req.param('which') as 'image' | 'source');
  if (!img) throw new HTTPException(404, { message: m.server_err_render_not_found() });
  const comma = img.url.indexOf(',');
  const type = img.url.slice(5, img.url.indexOf(';'));
  const bytes = Uint8Array.from(atob(img.url.slice(comma + 1)), ch => ch.charCodeAt(0));
  return c.body(bytes, 200, {
    'Content-Type': type, // Never changes once made (a new render is a new id); on a share page, cached briefly so unpublishing takes effect
    'Cache-Control': shown ? 'public, max-age=3600' : 'private, max-age=31536000, immutable',
  });
});
