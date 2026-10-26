/**
 * The design's canvas page (issue 171): modules the agent writes to run in the sandboxed canvas page, and the data each keeps.
 * Saving a module first tries it in the open page when the editor has one (CapabilityContext.host.canvas), so a module that
 * throws comes back as the error to fix instead of being saved.
 */
import { z } from 'zod';
import { defineEdit, defineRead, type CapabilityContext } from './capability.js';
import { TxError } from '../session/session.js';
import { text } from '../i18n.js';
import type { CanvasModule, CanvasPage, Project } from '../model/schema.js';

/** Implemented by the editor while a canvas page is open: runs a module there briefly and says whether it threw */
export interface CanvasHost {
  tryModule(id: string, source: string): Promise<{ ok: true; tried: boolean } | { ok: false; error: string }>;
}

export const CANVAS_LIMITS = { source: 60000, modules: 30, data: 200000 };

const zId = z
  .string()
  .regex(/^[a-z][a-z0-9-]{0,47}$/)
  .describe('kebab-case id, e.g. structural-grid');

const modules = (p: Project) => p.canvas?.modules ?? [];

/*
 * Changing a canvas page, wherever it is kept: a design's (project.canvas) or a person's own, in their settings (modules they add
 * for themselves, run in every design they open)
 */
const moduleIn = (page: CanvasPage | undefined, id: string) => {
  const m = page?.modules.find(x => x.id === id);
  if (!m) throw new TxError('not-found', text('err_canvas_module_not_found', 'No canvas module {id} in this design', { id }));
  return m;
};

/** The page with a module added or replaced (same id; its version goes up) */
export function putCanvasModule(page: CanvasPage | undefined, i: { id: string; name: string; description?: string; source: string }) {
  const list = page?.modules ?? [];
  const old = list.find(m => m.id === i.id);
  if (!old && list.length >= CANVAS_LIMITS.modules)
    throw new TxError('invalid-input', text('err_canvas_modules_full', 'At most {n} canvas modules', { n: CANVAS_LIMITS.modules }));
  const m: CanvasModule = {
    id: i.id,
    name: i.name,
    ...(i.description ? { description: i.description } : {}),
    source: i.source,
    version: (old?.version ?? 0) + 1,
  };
  return { page: { ...page, modules: old ? list.map(x => (x.id === i.id ? m : x)) : [...list, m] }, module: m };
}

/** The page without a module, nor the data it kept */
export function removeCanvasModule(page: CanvasPage | undefined, id: string): CanvasPage {
  moduleIn(page, id);
  const { [id]: _gone, ...data } = page?.data ?? {};
  return { modules: page!.modules.filter(m => m.id !== id), ...(Object.keys(data).length ? { data } : {}) };
}

/** The page with a module's data replaced */
export function setCanvasData(page: CanvasPage | undefined, id: string, value: unknown): CanvasPage {
  moduleIn(page, id);
  const json = JSON.stringify(value ?? null);
  if (json.length > CANVAS_LIMITS.data)
    throw new TxError('invalid-input', text('err_canvas_data_size', 'Module data is limited to {n} characters', { n: CANVAS_LIMITS.data }));
  return { ...page!, data: { ...page!.data, [id]: JSON.parse(json) } };
}

/** A canvas page as the server accepts it (a person's own modules) */
export const canvasPageSchema: z.ZodType<CanvasPage> = z.object({
  modules: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z][a-z0-9-]{0,47}$/),
        name: z.string().min(1).max(80),
        description: z.string().max(1000).optional(),
        source: z.string().min(1).max(CANVAS_LIMITS.source),
        version: z.number().int().min(1),
      }),
    )
    .max(CANVAS_LIMITS.modules),
  data: z
    .record(z.string(), z.unknown())
    .refine(d => JSON.stringify(d).length <= CANVAS_LIMITS.data * CANVAS_LIMITS.modules)
    .optional(),
});

export const canvasModules = defineRead({
  name: 'canvas_modules',
  title: 'List canvas modules',
  description:
    'The modules this design adds to its canvas page (id, name, description, version, size) and which keep data. sources=true also returns their source, to change one with canvas_module_put.',
  input: z.object({ sources: z.boolean().optional() }),
  run: (i, { session }) => {
    const p = session.project;
    return modules(p).map(m => ({
      id: m.id,
      name: m.name,
      description: m.description,
      version: m.version,
      bytes: m.source.length,
      hasData: p.canvas?.data?.[m.id] !== undefined,
      ...(i.sources ? { source: m.source } : {}),
    }));
  },
});

export const canvasModulePut = defineEdit({
  name: 'canvas_module_put',
  title: 'Save canvas module',
  description: [
    "Add a module to this design's canvas page, or replace one (same id; its version goes up). The canvas is a sandboxed web page drawn from",
    'ready-made code, the wheels; a module is an ES module run on top of the default page: `export default function (canvas) { … }`.',
    'Read canvas_wheels first and use the wheels (plan layers, selectable, draggable, snap lines, the wall tool, data) rather than rewriting them.',
    'One module per feature, a few hundred lines at most. The page has no network. The module is tried in the open page before it is saved:',
    "an error comes back to fix. Keep the module's own state with canvas.data.set (canvas_data_set), so it undoes and is shared with the design.",
  ].join(' '),
  input: z.object({
    id: zId,
    name: z.string().min(1).max(80).describe('Display name, in the language the project data uses'),
    description: z.string().max(1000).optional().describe('What it does (English)'),
    source: z.string().min(1).max(CANVAS_LIMITS.source).describe('The module source'),
  }),
  label: i => text('log_canvas_module_put', 'Save canvas module “{name}”', { name: i.name }),
  prepare: async (i, ctx: CapabilityContext) => {
    const host = ctx.host?.canvas as CanvasHost | undefined;
    if (!host) return;
    const r = await host.tryModule(i.id, i.source);
    if (!r.ok) throw new TxError('invalid-input', text('err_canvas_module_failed', 'The module failed in the canvas page: {error}', { error: r.error }));
    tried.set(i, r.tried);
  },
  apply: (p, i) => {
    const { page, module: m } = putCanvasModule(p.canvas, i);
    p.canvas = page;
    return { id: m.id, version: m.version, tried: tried.get(i) ?? false };
  },
});
/** Whether the module was tried in an open page before being saved */
const tried = new WeakMap<object, boolean>();

export const canvasModuleRemove = defineEdit({
  name: 'canvas_module_remove',
  title: 'Remove canvas module',
  description: "Remove a module from this design's canvas page, with the data it kept.",
  input: z.object({ id: zId }),
  label: (i, p) => text('log_canvas_module_remove', 'Remove canvas module “{name}”', { name: modules(p).find(m => m.id === i.id)?.name ?? i.id }),
  apply: (p, i) => {
    p.canvas = removeCanvasModule(p.canvas, i.id);
    return { id: i.id };
  },
});

export const canvasDataSet = defineEdit({
  name: 'canvas_data_set',
  title: 'Change canvas module data',
  description: "Replace the data a canvas module keeps (its own JSON, e.g. a grid's lines). Modules call it through canvas.data.set; the agent may too.",
  input: z.object({ module: zId, data: z.unknown() }),
  label: (i, p) => text('log_canvas_data_set', 'Change “{name}”', { name: modules(p).find(m => m.id === i.module)?.name ?? i.module }),
  apply: (p, i) => {
    p.canvas = setCanvasData(p.canvas, i.module, i.data);
    return { module: i.module };
  },
});
