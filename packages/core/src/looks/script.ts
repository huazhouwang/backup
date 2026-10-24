/**
 * Recipes: what a type of object looks like, as a JSONata script (https://jsonata.org) — like a React component, a function from
 * the object's size and its parameters to parts. The script sees the size ($w, $d, $h, millimetres) and its parameters (declared
 * with defaults in `params`, overridden per object) as variables, calls the helpers below to make parts (the part format of
 * recipe.ts, with numbers), and returns them as a list (nested lists are flattened), or { parts, plan } to draw its own plan
 * symbol. The same script builds the 3D model at any size and the plan symbol seen from above.
 *
 * Scripts are data, never JavaScript: they can only call the helpers bound here, and guardrails stop runaway ones (stack depth,
 * time, sequence length, number of parts). Evaluation is asynchronous; looks/cache.ts keeps built results for synchronous use.
 *
 * Local frame: origin at the centre of the footprint on the floor (an opening: the centre of its sill; an element: the centre
 * of its plan extent on its level's floor), x across the width, z across the depth (+z is the front, south at rotation 0), y up.
 * Angles are in degrees.
 */
import jsonata from 'jsonata';
import { z } from 'zod';
import { hashRandom } from './expr.js';
import { materialSchema, type Material, type Names } from './material.js';
import {
  buildParts,
  inspectParts,
  recipePartSchema,
  planSymbol,
  RecipeError,
  RECIPE_LIMITS,
  type BuiltPart,
  type BuiltPlanItem,
  type PlanSymbol,
  type RecipeInspection,
  type RecipePart,
  type RecipeSize,
} from './recipe.js';

/** A parameter value: any JSON scalar */
export type ParamValue = string | number | boolean | null;
export const PARAM_TYPES = ['string', 'number', 'integer', 'boolean', 'null'] as const;
export type ParamType = (typeof PARAM_TYPES)[number];

/**
 * A parameter declaration, in JSON Schema keywords so the UI, the agent and anyone reading the file know the valid values
 * without running the script. `type` and `default` are required; a type list with 'null' lets the value be left to the script
 * (default null). `format: 'material'` marks a material id; `enum` closes the set of values (with `enumTitles`, our extension,
 * naming each in the same order); `minimum`/`maximum` bound a number; `title` is shown to people, `description` is for the agent.
 */
export interface ParamDecl {
  type: ParamType | ParamType[];
  default: ParamValue;
  format?: 'material';
  enum?: ParamValue[];
  enumTitles?: Names[];
  minimum?: number;
  maximum?: number;
  title?: Names;
  description?: string;
}

export interface Recipe {
  /** Parameters an object can set (declarations with defaults) */
  params?: Record<string, ParamDecl>;
  /** Seed for $rnd(k) */
  seed?: number;
  /** A JSONata expression returning parts */
  script: string;
  /** Materials it uses beyond the default library's (its library's, or its own) */
  materials?: Record<string, Material>;
}

const paramValue = z.union([z.string().max(200), z.number(), z.boolean(), z.null()]);
const paramName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/);
const names = z.object({ zh: z.string().max(200).optional(), en: z.string().max(200).optional() });
export const paramDeclSchema: z.ZodType<ParamDecl> = z
  .object({
    type: z.union([z.enum(PARAM_TYPES), z.array(z.enum(PARAM_TYPES)).min(1).max(5)]),
    default: paramValue,
    format: z.literal('material').optional(),
    enum: z.array(paramValue).min(1).max(50).optional(),
    enumTitles: z.array(names).max(50).optional(),
    minimum: z.number().optional(),
    maximum: z.number().optional(),
    title: names.optional(),
    description: z.string().max(500).optional(),
  })
  .superRefine((d, ctx) => {
    const problem = checkDecl(d);
    if (problem) ctx.addIssue({ code: 'custom', message: problem });
  });

/** The types a declaration allows */
export const paramTypes = (d: Pick<ParamDecl, 'type'>): ParamType[] => (Array.isArray(d.type) ? d.type : [d.type]);

const typeOf = (v: ParamValue): ParamType =>
  v === null ? 'null' : typeof v === 'number' ? (Number.isInteger(v) ? 'integer' : 'number') : (typeof v as ParamType);
const fits = (types: ParamType[], v: ParamValue) => types.includes(typeOf(v)) || (typeOf(v) === 'integer' && types.includes('number'));

/** Why a declaration doesn't hold together (its default, enum and titles), or null */
function checkDecl(d: ParamDecl): string | null {
  const types = paramTypes(d);
  if (d.format === 'material' && !types.includes('string')) return 'a material parameter has type string';
  if (d.enumTitles && d.enumTitles.length !== d.enum?.length) return 'enumTitles names each enum value, in the same order';
  if (d.default === null && !types.includes('null')) return 'default null needs "null" among the types';
  return checkParamValue(d, d.default, 'default');
}

/** Why a value doesn't fit a parameter's declaration (a readable sentence), or null when it does */
export function checkParamValue(d: ParamDecl, v: ParamValue, name = 'the value'): string | null {
  const types = paramTypes(d);
  if (v === null) return types.includes('null') ? null : `${name} can't be left empty`;
  if (!fits(types, v)) return `${name} must be ${types.filter(t => t !== 'null').join(' or ')}`;
  if (d.enum && !d.enum.includes(v)) return `${name} must be one of ${d.enum.map(String).join(', ')}`;
  if (typeof v === 'number' && d.minimum !== undefined && v < d.minimum) return `${name} must be at least ${d.minimum}`;
  if (typeof v === 'number' && d.maximum !== undefined && v > d.maximum) return `${name} must be at most ${d.maximum}`;
  return null;
}

export const recipeSchema: z.ZodType<Recipe> = z.object({
  params: z.record(paramName, paramDeclSchema).optional(),
  seed: z.number().int().optional(),
  script: z.string().min(1).max(30000),
  materials: z
    .record(
      z
        .string()
        .regex(/^[A-Za-z][A-Za-z0-9_-]*$/)
        .max(64),
      materialSchema,
    )
    .optional(),
});

export const SCRIPT_LIMITS = { stack: 300, timeout: 500, sequence: 20000, parts: RECIPE_LIMITS.parts };

/** A script's output: parts with numbers, up to the part limit */
const outputSchema = z.object({ parts: z.array(recipePartSchema).max(SCRIPT_LIMITS.parts) });

/** A recipe's parameter defaults */
export function paramDefaults(r: Pick<Recipe, 'params'>): Record<string, ParamValue> {
  return Object.fromEntries(Object.entries(r.params ?? {}).map(([k, d]) => [k, d.default]));
}

type V3 = [number, number, number];
const DEG = Math.PI / 180;
const opt = <T>(v: T | null | undefined) => (v === null ? undefined : v);
/** Drop undefined fields, so parts compare and serialise cleanly */
const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined && x !== null)) as unknown as RecipePart;

/** The helpers a script can call; each returns a part (or a list of parts) */
function helpers(seed: number) {
  return {
    /** A box: size [w, h, d] centred at [x, y, z], r edge radius, rot [rx, ry, rz] */
    box: (size: V3, at: V3, mat: string, r?: number, rot?: V3) => clean({ kind: 'box', mat, size, at, r: opt(r), rot: opt(rot) }),
    /** A box standing on y0 */
    block: (size: V3, x: number, y0: number, z: number, mat: string, r?: number) => clean({ kind: 'box', mat, size, at: [x, y0 + size[1] / 2, z], r: opt(r) }),
    /** A cylinder of radius r (bottom) and height h centred at `at`; o: { r2 top radius, axis x|y|z, seg, scale } */
    cylinder: (r: number, h: number, at: V3, mat: string, o?: Record<string, unknown>) => clean({ kind: 'cylinder', mat, r, h, at, ...o }),
    sphere: (r: number, at: V3, mat: string, scale?: V3) => clean({ kind: 'sphere', mat, r, at, scale: opt(scale) }),
    /** A solid of revolution: profile [[r, y]…] from the axis out and back, standing at `at`; o: { scale, seg } */
    lathe: (profile: [number, number][], at: V3, mat: string, o?: Record<string, unknown>) => clean({ kind: 'lathe', mat, profile, at, ...o }),
    rod: (from: V3, to: V3, r: number, mat: string, seg?: number) => clean({ kind: 'rod', mat, from, to, r, seg: opt(seg) }),
    /** A torus of radius R and thickness r; axis y lies flat, z stands up */
    ring: (R: number, r: number, at: V3, mat: string, axis?: string) => clean({ kind: 'ring', mat, R, r, at, axis: opt(axis) }),
    /** A smooth tube through points */
    tube: (points: V3[], r: number, mat: string) => clean({ kind: 'tube', mat, points, r }),
    /** A vertical panel from [x, z] to [x, z], from height y up h, t thick */
    panel: (from: [number, number], to: [number, number], y: number, h: number, t: number, mat: string) => clean({ kind: 'panel', mat, from, to, y, h, t }),
    /** A profile extruded: plane 'side' (x, y across z) or 'plan' (x, z upwards); items [x, y], {arc: [cx, cy, r, a0, a1, clockwise]}, {curve: [cx, cy, x, y]} */
    extrude: (plane: string, profile: unknown[], depth: number, mat: string, bevel?: number, at?: V3) =>
      clean({ kind: 'extrude', mat, plane, profile, depth, bevel: opt(bevel), at: opt(at) }),
    /** An element's own geometry (stairs, ponds, drains) in these materials */
    base: (mats: Record<string, string>) => ({ kind: 'base', mats }) as RecipePart,
    /** Leave parts out of the plan symbol */
    noplan: (p: RecipePart | RecipePart[]) => (Array.isArray(p) ? p.map(x => ({ ...x, plan: false })) : { ...p, plan: false }),
    /** Four legs set in from the corners of w × d, h tall; round legs (radius r) taper slightly to the floor, square ones are 2r wide */
    fourLegs: (w: number, d: number, inset: number, h: number, r: number, mat: string, square?: boolean) =>
      [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].map(([sx, sz]) => {
        const at: V3 = [sx * (w / 2 - inset), h / 2, sz * (d / 2 - inset)];
        return square
          ? clean({ kind: 'box', mat, size: [2 * r, h, 2 * r], at, r: r * 0.3 })
          : clean({ kind: 'cylinder', mat, r: r * 0.8, r2: r, h, at, seg: 12 });
      }),
    sin: (a: number) => Math.sin(a * DEG),
    cos: (a: number) => Math.cos(a * DEG),
    tan: (a: number) => Math.tan(a * DEG),
    atan2: (y: number, x: number) => Math.atan2(y, x) / DEG,
    hypot: (...a: number[]) => Math.hypot(...a),
    clamp: (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi),
    lerp: (a: number, b: number, t: number) => a + (b - a) * t,
    /** Rounds half up (JSONata's own $round rounds half to even) */
    round: (x: number) => Math.round(x),
    /** Pseudo-random in [0, 1), the same for the same seed and k */
    rnd: (k: number) => hashRandom(seed, k),
  };
}

/** Names of the helpers and built-in variables other than the size, which variables and parameters can't take */
export const SCRIPT_HELPERS = [...Object.keys(helpers(1)), 'pi'];

const compiled = new Map<string, ReturnType<typeof jsonata>>();

/**
 * The variables a script sets (:=, function arguments, focus/index bindings), and those it reads but never sets (JSONata treats
 * them as empty, which makes confusing errors later): references that aren't set, a function being called, or `known`
 */
export function scriptVariables(ast: unknown, known: Set<string>): { unknown: string[]; assigned: Set<string> } {
  const assigned = new Set<string>(),
    refs = new Set<string>();
  const walk = (n: unknown, callee = false) => {
    if (Array.isArray(n)) return n.forEach(x => walk(x));
    if (!n || typeof n !== 'object') return;
    const o = n as Record<string, unknown>;
    if (o.type === 'variable' && typeof o.value === 'string' && o.value !== '' && o.value !== '$' && !callee) refs.add(o.value);
    if (o.type === 'bind' && (o.lhs as { value?: string })?.value) assigned.add((o.lhs as { value: string }).value);
    if (o.type === 'lambda') for (const a of (o.arguments as { value: string }[]) ?? []) assigned.add(a.value);
    for (const k of ['focus', 'index']) if (typeof o[k] === 'string') assigned.add(o[k] as string);
    for (const [k, v] of Object.entries(o)) if (k !== 'lhs' || o.type !== 'bind') walk(v, k === 'procedure');
  };
  walk(ast);
  return { unknown: [...refs].filter(r => !assigned.has(r) && !known.has(r)), assigned };
}
const flatten = (v: unknown): unknown[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v.flatMap(flatten) : [v]);

/** A script's output at a size with parameters: its parts (numbers) and its own plan symbol, if any */
export async function runScript(r: Recipe, size: RecipeSize, params: Record<string, unknown> = {}): Promise<{ parts: RecipePart[]; plan?: BuiltPlanItem[] }> {
  let expr = compiled.get(r.script);
  if (!expr) {
    try {
      expr = jsonata(r.script, { stack: SCRIPT_LIMITS.stack, timeout: SCRIPT_LIMITS.timeout, sequence: SCRIPT_LIMITS.sequence } as never);
    } catch (e) {
      const err = e as { code?: string; message: string; position?: number };
      throw new RecipeError(`script${err.code ? ` ${err.code}` : ''}${err.position !== undefined ? ` at ${err.position}` : ''}: ${err.message}`);
    }
    if (compiled.size > 500) compiled.clear();
    compiled.set(r.script, expr);
  }
  const fns = helpers(r.seed ?? 1);
  const values: Record<string, unknown> = { ...paramDefaults(r), ...params, ...size };
  const { unknown, assigned } = scriptVariables(expr.ast(), new Set([...Object.keys(values), ...Object.keys(fns), 'pi']));
  const hidden = [...assigned].filter(v => v in values || v in fns);
  if (hidden.length)
    throw new RecipeError(
      `script: $${hidden[0]} is set with :=, which hides the ${hidden[0] in fns ? 'helper' : hidden[0] in size ? 'size' : 'parameter'} of that name; use another name`,
    );
  if (unknown.length)
    throw new RecipeError(
      `script: unknown variable ${unknown.map(u => `$${u}`).join(', ')} (known: ${['w', 'd', 'h', ...Object.keys(paramDefaults(r))].map(k => `$${k}`).join(', ')}, and variables the script sets with :=)`,
    );
  const clash = Object.keys(paramDefaults(r)).find(k => k in fns || k === 'pi' || k in size);
  if (clash) throw new RecipeError(`parameter "${clash}" has the name of a helper or a size`);
  let out: unknown;
  try {
    // Variables ($w, $fabric…) read the same everywhere; bare names would refer to the current item inside mapping steps
    out = await expr.evaluate(values, { ...values, ...fns, pi: Math.PI });
  } catch (e) {
    const err = e as { code?: string; message: string; position?: number };
    throw new RecipeError(`script${err.code ? ` ${err.code}` : ''}${err.position !== undefined ? ` at ${err.position}` : ''}: ${err.message}`);
  }
  const own = out && typeof out === 'object' && !Array.isArray(out) && 'parts' in out ? (out as { parts: unknown; plan?: unknown }) : null;
  const parts = flatten(own ? own.parts : out) as RecipePart[];
  if (parts.length > SCRIPT_LIMITS.parts) throw new RecipeError(`the script made ${parts.length} parts (at most ${SCRIPT_LIMITS.parts})`);
  return { parts, ...(own?.plan ? { plan: flatten(own.plan) as BuiltPlanItem[] } : {}) };
}

/** What a recipe builds: its parts, and its own plan symbol if it draws one */
export interface Built {
  parts: BuiltPart[];
  plan?: BuiltPlanItem[];
}

/** Build a recipe at a size with parameters (checked: bad output throws a RecipeError) */
export async function buildRecipe(r: Recipe, size: RecipeSize, params: Record<string, unknown> = {}): Promise<Built> {
  const out = await runScript(r, size, params);
  const parsed = outputSchema.safeParse({ parts: out.parts });
  if (!parsed.success)
    throw new RecipeError(
      parsed.error.issues
        .slice(0, 5)
        .map(i => `${i.path.join('.')}: ${i.message}`)
        .join('; '),
    );
  return { parts: buildParts(parsed.data, size), ...(out.plan ? { plan: out.plan } : {}) };
}

/** The plan symbol of what a recipe built */
export const builtPlan = (b: Built): PlanSymbol => planSymbol(b.parts, b.plan);

/**
 * Check a recipe as the agent or a user wrote it: its shape, and that it builds at the given size and at half and twice that
 * size with its default parameters (and `params`). Returns readable problems (empty when it's fine).
 */
export async function checkRecipe(input: unknown, size: RecipeSize, params: Record<string, unknown> = {}): Promise<string[]> {
  const parsed = recipeSchema.safeParse(input);
  if (!parsed.success) return parsed.error.issues.slice(0, 10).map(i => `${i.path.join('.') || 'recipe'}: ${i.message}`);
  for (const k of [1, 0.5, 2]) {
    try {
      await buildRecipe(parsed.data, { ...size, w: size.w * k, d: size.d * k, h: size.h * k }, params);
    } catch (e) {
      return [`at ${k === 1 ? 'its size' : `${k}× its size`}: ${e instanceof Error ? e.message : String(e)}`];
    }
  }
  return [];
}

/** What a recipe builds at a size, for checking it without seeing it */
export async function inspectRecipe(r: Recipe, size: RecipeSize, params: Record<string, unknown> = {}): Promise<RecipeInspection> {
  return inspectParts((await buildRecipe(r, size, params)).parts, size);
}
