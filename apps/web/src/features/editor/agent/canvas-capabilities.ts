/**
 * The canvas page for the agent (issue 171): the wheels' reference, read before writing a module (canvas_module_put), and the
 * person's own modules, kept in their settings and run in every design they open. Run in the browser; the server only uses the
 * definitions to describe the tools.
 */
import { CANVAS_LIMITS, defineRead, putCanvasModule, removeCanvasModule } from '@plinth/core';
import { z } from 'zod';
import { m, uiName } from '@/lib/i18n';
import { WHEELS_DOC } from '@/wheels/docs';
import { tryModule } from '../sandbox/host';
import { changeMyCanvas, myCanvas } from '../sandbox/mine';
import { publishCanvasModule, widgetLibraryFiles } from '@/lib/widget-libraries';

export const canvasWheels = defineRead({
  name: 'canvas_wheels',
  title: 'Read canvas wheels',
  kind: 'query',
  permission: 'read',
  runtime: 'any',
  description:
    'The reference for writing canvas modules: what a module receives (canvas), every wheel (bridge, data, plan view, selectable, draggable, snaps, the wall tool, toolbar) and an example. Read it before canvas_module_put, and use the wheels instead of rewriting them.',
  input: z.object({}),
  run: () => ({ doc: WHEELS_DOC }),
});

const zId = z
  .string()
  .regex(/^[a-z][a-z0-9-]{0,47}$/)
  .describe('kebab-case id, e.g. structural-grid');

export const canvasMyModules = defineRead({
  name: 'canvas_my_modules',
  title: 'List my canvas modules',
  kind: 'query',
  permission: 'read',
  runtime: 'browser',
  description:
    "The user's own canvas modules: kept in their settings, not in this design, and run in every design they open (only they see them). sources=true also returns their source.",
  input: z.object({ sources: z.boolean().optional() }),
  run: async i =>
    (await myCanvas()).modules.map(x => ({
      id: x.id,
      name: x.name,
      description: x.description,
      version: x.version,
      bytes: x.source.length,
      ...(i.sources ? { source: x.source } : {}),
    })),
});

export const canvasMyModulePut = defineRead({
  name: 'canvas_my_module_put',
  title: 'Save my canvas module',
  kind: 'relation',
  permission: 'reversible',
  runtime: 'browser',
  description:
    'Like canvas_module_put, but for the user themselves: the module is kept in their settings and runs in every design they open, seen only by them. Use it only when they ask for something for themselves ("for me", "in all my designs"); otherwise use canvas_module_put. Its canvas.data is kept in their settings too. Tried in the open page first: an error comes back to fix.',
  input: z.object({
    id: zId,
    name: z.string().min(1).max(80).describe('Display name, in the language the user writes in'),
    description: z.string().max(1000).optional().describe('What it does (English)'),
    source: z.string().min(1).max(CANVAS_LIMITS.source).describe('The module source'),
  }),
  run: async i => {
    const r = await tryModule('me', i.id, i.source);
    if (!r.ok) throw new Error(m.editor_my_canvas_failed({ error: r.error }));
    let version = 0;
    await changeMyCanvas(page => {
      const next = putCanvasModule(page, i);
      version = next.module.version;
      return next.page;
    });
    return { id: i.id, version, tried: r.tried };
  },
});

export const canvasMyModuleRemove = defineRead({
  name: 'canvas_my_module_remove',
  title: 'Remove my canvas module',
  kind: 'relation',
  permission: 'reversible',
  runtime: 'browser',
  description: "Remove one of the user's own canvas modules, with the data it kept.",
  input: z.object({ id: zId }),
  run: async i => {
    await changeMyCanvas(page => removeCanvasModule(page, i.id));
    return { id: i.id };
  },
});

/*
 * Wheels people made (issue 171): canvas modules published in libraries (the widget libraries the user can use), to import into a
 * design as a copy that remembers where it came from, instead of writing the same thing again
 */
export const canvasWheelList = defineRead({
  name: 'canvas_wheel_list',
  title: 'List shared canvas wheels',
  kind: 'query',
  permission: 'read',
  runtime: 'browser',
  description:
    'Canvas modules published as wheels in the libraries the user can use (their own and shared ones): library, module id, name, what it does, version, and whether the user may publish into that library. Look here before writing a module: import one with canvas_wheel_get then canvas_module_put.',
  input: z.object({}),
  run: async () =>
    (await widgetLibraryFiles()).map(f => ({
      library: f.library.id,
      name: uiName(f.library.name),
      canPublish: f.role !== 'viewer',
      wheels: Object.entries(f.library.canvasModules ?? {}).map(([id, w]) => ({ module: id, name: w.name, description: w.description, version: w.version })),
    })),
});

export const canvasWheelGet = defineRead({
  name: 'canvas_wheel_get',
  title: 'Read a shared canvas wheel',
  kind: 'query',
  permission: 'read',
  runtime: 'browser',
  description:
    'Read a wheel published in a library: { id, name, description, source, origin }, to pass to canvas_module_put as is (or canvas_my_module_put). The design keeps its own copy; the library changing never changes it.',
  input: z.object({ library: z.string().describe('Library ID'), module: z.string().describe('Module ID in the library') }),
  run: async i => {
    const lib = (await widgetLibraryFiles()).find(f => f.library.id === i.library)?.library;
    const w = lib?.canvasModules?.[i.module];
    if (!w) throw new Error(m.editor_wheel_not_found({ module: i.module }));
    return { id: i.module, name: w.name, description: w.description, source: w.source, origin: { library: i.library, module: i.module, version: w.version } };
  },
});

export const canvasWheelPublish = defineRead({
  name: 'canvas_wheel_publish',
  title: 'Publish a canvas module as a wheel',
  kind: 'relation',
  permission: 'reversible',
  runtime: 'browser',
  description:
    "Publish one of this design's canvas modules (or, with mine, one of the user's own) as a wheel in a library the user may publish into (canvas_wheel_list), so other designs and agents can import it. Publishing again with a changed source makes a new version. Write its description for other agents: what it does, the data it keeps, how to use it.",
  input: z.object({
    module: zId.describe("ID of the design's module (or the user's own, with mine)"),
    library: z.string().describe('Library ID'),
    mine: z.boolean().optional().describe("Publish one of the user's own modules"),
  }),
  run: async (i, ctx) => {
    const page = i.mine ? await myCanvas() : ctx.session.project.canvas;
    const mod = page?.modules.find(x => x.id === i.module);
    if (!mod) throw new Error(m.editor_wheel_not_found({ module: i.module }));
    return publishCanvasModule(i.library, i.module, { name: mod.name, ...(mod.description ? { description: mod.description } : {}), source: mod.source });
  },
});

export const CANVAS_CAPABILITIES = [
  canvasWheels,
  canvasMyModules,
  canvasMyModulePut,
  canvasMyModuleRemove,
  canvasWheelList,
  canvasWheelGet,
  canvasWheelPublish,
];
