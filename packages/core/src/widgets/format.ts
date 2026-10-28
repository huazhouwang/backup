/**
 * Widgets: tools people add to the canvas (a structural grid, a coordinate system…), as data the canvas interprets plus a script
 * run in the sandbox (#158). A widget declares parameters (the JSON Schema keywords of look parameters, so the panel is generated
 * from them) and a JavaScript function `widget(project, params, ctx)` returning a list of items to draw. Widgets live in their own
 * library files (`*.widgetlib.json`, format in libraries/widgetlib.schema.json), separate from look libraries.
 *
 * Coordinates are plan millimetres (x east, y south); an item may name the level it belongs to, else it shows on the current one.
 * Colours are the canvas's, from the theme: a widget can't choose any.
 */
import { z } from 'zod';
import { namesSchema, type Names } from '../looks/material.js';
import { SEMVER } from '../looks/library.js';
import { paramDeclSchema, paramTypes, type ParamDecl } from '../looks/script.js';
import type { Point } from '../model/schema.js';

/** What a widget may do; shown when it is installed. Only drawing for now; proposing model changes comes later. */
export const WIDGET_PERMISSIONS = ['draw'] as const;
export type WidgetPermission = (typeof WIDGET_PERMISSIONS)[number];

export interface WidgetDef {
  name: Names;
  /** semver; installs pin it */
  version: string;
  /** For the agent: what it is and how to tune it (English) */
  description: string;
  permissions: WidgetPermission[];
  params?: Record<string, ParamDecl>;
  /** JavaScript defining `function widget(project, params, ctx)`, returning a list of items */
  script: string;
}

export interface WidgetLibrary {
  $schema?: string;
  format: 'opensu-widgets';
  formatVersion: 1;
  id: string;
  name: Names;
  description?: Names;
  version: string;
  author?: string;
  /** SPDX identifier */
  license?: string;
  widgets: Record<string, WidgetDef>;
  /**
   * Canvas modules published as wheels (issue 171): modules for the sandboxed canvas page that agents import into other designs
   * (a copy, which keeps where it came from) instead of writing them again
   */
  canvasModules?: Record<string, LibraryCanvasModule>;
}

/** A canvas module kept in a library */
export interface LibraryCanvasModule {
  name: string;
  /** What it does and how to use it (English), for the agents that import it */
  description?: string;
  /** `export default function (canvas) { … }` */
  source: string;
  /** Goes up whenever its source changes; a design's copy records the one it took */
  version: number;
}

/** What the script is told besides the project and its params */
export interface WidgetContext {
  /** The current level */
  level: string | null;
  view: 'plan' | '3d';
  /** The project's language, for any text it draws */
  language: 'zh' | 'en';
}

/**
 * What a widget draws, one item each. `level` places it on a level (else the current one). A handle is dragged by the canvas,
 * writing its position into two number parameters (`x`, `y`) and running the script again. A snap is a point that placing and
 * dragging snap to.
 */
export type WidgetItem =
  | { type: 'line'; from: Point; to: Point; dash?: number[]; level?: string }
  | { type: 'label'; at: Point; text: string; level?: string }
  | { type: 'point'; at: Point; level?: string }
  | { type: 'area'; outline: Point[]; level?: string }
  | { type: 'handle'; at: Point; x: string; y: string; level?: string }
  | { type: 'snap'; at: Point; level?: string }
  | EffectItem;

/** How particles look: thin falling streaks (rain), soft flakes (snow, petals), small lights (fireflies) */
export const PARTICLE_SHAPES = ['streak', 'flake', 'glow'] as const;
/** The colours effects come in, each a theme variable (--canvas-effect-<tone>): a widget names a tone, never a colour */
export const EFFECT_TONES = ['water', 'snow', 'glow', 'leaf', 'dust', 'mist', 'warm', 'cool'] as const;
export const SKY_MOODS = ['overcast', 'dusk', 'night'] as const;

/**
 * 3D effects (issue 203), declared once per parameter change and animated by the host on the GPU:
 * - particles fill a plan area between two heights above its level (mm) and move: `fall` (m/s, negative rises), random `drift`
 *   (m/s), `wind` (m/s along plan x and y); `size` in mm;
 * - fog over the whole scene, `density` 0–1;
 * - a point light at a plan point, `z` mm above its level, `intensity` 0–1, `range` mm;
 * - the sky's mood, dimming the sun.
 * The host keeps them within budgets (EFFECT_LIMITS) and may thin them out to keep frames smooth.
 */
export type EffectItem =
  | {
      type: 'particles';
      outline: Point[];
      from: number;
      to: number;
      count: number;
      fall: number;
      drift?: number;
      wind?: Point;
      size: number;
      shape: (typeof PARTICLE_SHAPES)[number];
      tone: (typeof EFFECT_TONES)[number];
      level?: string;
    }
  | { type: 'fog'; density: number; tone: (typeof EFFECT_TONES)[number] }
  | { type: 'light'; at: Point; z: number; intensity: number; range: number; tone: (typeof EFFECT_TONES)[number]; level?: string }
  | { type: 'sky'; mood: (typeof SKY_MOODS)[number] };

/** Budgets for effects: per item, and over everything shown (the host scales particles down to fit the total) */
export const EFFECT_LIMITS = { particles: 20000, totalParticles: 40000, lights: 8, height: 100000, speed: 50, size: 2000 };

export const WIDGETLIB_FORMAT = 'opensu-widgets' as const;
/** The format id widget library files had before the rename to OpenSU (#179); still read */
export const LEGACY_WIDGETLIB_FORMAT = 'plinth-widgets';
export const WIDGETLIB_FORMAT_VERSION = 1;
/** Limits on what a widget may return */
export const WIDGET_LIMITS = { items: 5000, outline: 500, text: 200, dash: 8, coordinate: 1e7 };

const id = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/)
  .max(64);
const key = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/)
  .max(64);
const paramName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/);

export const widgetDefSchema: z.ZodType<WidgetDef> = z.object({
  name: namesSchema,
  version: z.string().regex(SEMVER),
  description: z.string().min(1).max(2000),
  permissions: z.array(z.enum(WIDGET_PERMISSIONS)).min(1),
  params: z.record(paramName, paramDeclSchema).optional(),
  script: z.string().min(1).max(30000),
});

export const libraryCanvasModuleSchema: z.ZodType<LibraryCanvasModule> = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(1000).optional(),
  source: z.string().min(1).max(60000),
  version: z.number().int().min(1),
});

export const widgetLibrarySchema: z.ZodType<WidgetLibrary> = z.object({
  $schema: z.string().optional(),
  format: z.enum([WIDGETLIB_FORMAT, LEGACY_WIDGETLIB_FORMAT]).transform(() => WIDGETLIB_FORMAT),
  formatVersion: z.literal(WIDGETLIB_FORMAT_VERSION),
  id,
  name: namesSchema,
  description: namesSchema.optional(),
  version: z.string().regex(SEMVER),
  author: z.string().max(200).optional(),
  license: z.string().max(100).optional(),
  widgets: z.record(key, widgetDefSchema),
  canvasModules: z.record(key, libraryCanvasModuleSchema).optional(),
});

export class WidgetError extends Error {}

const issues = (e: z.ZodError, root: string) =>
  e.issues
    .slice(0, 8)
    .map(i => `${i.path.join('.') || root}: ${i.message}`)
    .join('; ');

/** A widget library file, checked; throws a WidgetError */
export function parseWidgetLibrary(input: unknown): WidgetLibrary {
  const parsed = widgetLibrarySchema.safeParse(input);
  if (!parsed.success) throw new WidgetError(issues(parsed.error, 'library'));
  return parsed.data;
}

const coord = z.number().finite().min(-WIDGET_LIMITS.coordinate).max(WIDGET_LIMITS.coordinate);
const point = z.tuple([coord, coord]);
const level = z.string().max(64).optional();
const height = z.number().finite().min(-EFFECT_LIMITS.height).max(EFFECT_LIMITS.height);
const speed = z.number().finite().min(-EFFECT_LIMITS.speed).max(EFFECT_LIMITS.speed);
const itemSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('line'),
    from: point,
    to: point,
    dash: z.array(z.number().finite().positive().max(1e5)).max(WIDGET_LIMITS.dash).optional(),
    level,
  }),
  z.strictObject({ type: z.literal('label'), at: point, text: z.string().max(WIDGET_LIMITS.text), level }),
  z.strictObject({ type: z.literal('point'), at: point, level }),
  z.strictObject({ type: z.literal('area'), outline: z.array(point).min(3).max(WIDGET_LIMITS.outline), level }),
  z.strictObject({ type: z.literal('handle'), at: point, x: paramName, y: paramName, level }),
  z.strictObject({ type: z.literal('snap'), at: point, level }),
  z.strictObject({
    type: z.literal('particles'),
    outline: z.array(point).min(3).max(WIDGET_LIMITS.outline),
    from: height,
    to: height,
    count: z.number().int().min(1).max(EFFECT_LIMITS.particles),
    fall: speed,
    drift: speed.min(0).optional(),
    wind: z.tuple([speed, speed]).optional(),
    size: z.number().finite().positive().max(EFFECT_LIMITS.size),
    shape: z.enum(PARTICLE_SHAPES),
    tone: z.enum(EFFECT_TONES),
    level,
  }),
  z.strictObject({ type: z.literal('fog'), density: z.number().min(0).max(1), tone: z.enum(EFFECT_TONES) }),
  z.strictObject({
    type: z.literal('light'),
    at: point,
    z: height,
    intensity: z.number().min(0).max(1),
    range: z.number().finite().positive().max(EFFECT_LIMITS.height),
    tone: z.enum(EFFECT_TONES),
    level,
  }),
  z.strictObject({ type: z.literal('sky'), mood: z.enum(SKY_MOODS) }),
]);
const outputSchema = z.array(itemSchema).max(WIDGET_LIMITS.items);

/**
 * A script's result as items, or a WidgetError: only the known items, finite coordinates in range, capped counts, and handles
 * bound to number parameters the widget declares. One bad item drops the whole output.
 */
export function validateWidgetOutput(raw: unknown, def: Pick<WidgetDef, 'params'>): WidgetItem[] {
  const parsed = outputSchema.safeParse(raw);
  if (!parsed.success) throw new WidgetError(issues(parsed.error, 'output'));
  for (const item of parsed.data)
    if (item.type === 'handle')
      for (const p of [item.x, item.y]) {
        const d = def.params?.[p];
        if (!d || !paramTypes(d).some(t => t === 'number' || t === 'integer'))
          throw new WidgetError(`a handle moves ${p}, which is not a number parameter of the widget`);
      }
  for (const item of parsed.data) if (item.type === 'particles' && item.to <= item.from) throw new WidgetError('particles: `to` must be above `from`');
  if (parsed.data.filter(i => i.type === 'light').length > EFFECT_LIMITS.lights) throw new WidgetError(`at most ${EFFECT_LIMITS.lights} lights`);
  return parsed.data as WidgetItem[];
}
