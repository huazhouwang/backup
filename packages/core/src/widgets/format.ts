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
  format: 'plinth-widgets';
  formatVersion: 1;
  id: string;
  name: Names;
  description?: Names;
  version: string;
  author?: string;
  /** SPDX identifier */
  license?: string;
  widgets: Record<string, WidgetDef>;
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
  | { type: 'snap'; at: Point; level?: string };

export const WIDGETLIB_FORMAT = 'plinth-widgets';
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

export const widgetLibrarySchema: z.ZodType<WidgetLibrary> = z.object({
  $schema: z.string().optional(),
  format: z.literal(WIDGETLIB_FORMAT),
  formatVersion: z.literal(WIDGETLIB_FORMAT_VERSION),
  id,
  name: namesSchema,
  description: namesSchema.optional(),
  version: z.string().regex(SEMVER),
  author: z.string().max(200).optional(),
  license: z.string().max(100).optional(),
  widgets: z.record(key, widgetDefSchema),
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
  return parsed.data as WidgetItem[];
}
