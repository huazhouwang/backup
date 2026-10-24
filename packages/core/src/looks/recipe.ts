/**
 * Recipes: what a type of object looks like, as data. A recipe lists parts (rounded boxes, cylinders, solids of revolution,
 * bars, rings, tubes, panels, extruded profiles), each with a material, whose sizes and positions are expressions of the
 * object's size (see expr.ts). The same recipe builds the 3D model at any size and the plan symbol seen from above, so a
 * resized object keeps its proportions and the plan always matches the model. Recipes are data, never code.
 *
 * Local frame, in millimetres: origin at the centre of the footprint on the floor (an opening: the centre of its sill; an
 * element: the centre of its plan extent on its level's floor), x across the width `w`, z across the depth `d` (+z is the
 * front, south at rotation 0), y up to the height `h`. Angles are in degrees.
 */
import { z } from 'zod';
import { evalExpr, type Scope } from './expr.js';
import type { Point } from '../model/schema.js';

/** A material id: one of the default library's, or one the recipe's library or the recipe itself defines (see material.ts) */
export type RecipeMaterial = string;

/** A number, or an expression of w, d, h and the recipe's names */
export type Expr = number | string;
type V2 = [Expr, Expr];
type V3 = [Expr, Expr, Expr];
/** A point of a 2D profile, an arc (centre x, y, radius, from and to angle in degrees, clockwise) or a quadratic curve */
export type ProfileItem = V2 | { arc: [Expr, Expr, Expr, Expr, Expr, boolean?] } | { curve: [Expr, Expr, Expr, Expr] };

interface Common {
  mat: RecipeMaterial;
  /** Drawn in the plan symbol (default true) */
  plan?: boolean;
}
export type RecipePart =
  | (Common & { kind: 'box'; size: V3; at: V3; r?: Expr; rot?: V3 })
  | (Common & { kind: 'cylinder'; r: Expr; r2?: Expr; h: Expr; at: V3; axis?: 'x' | 'y' | 'z'; scale?: V3; seg?: number })
  | (Common & { kind: 'sphere'; r: Expr; at: V3; scale?: V3 })
  | (Common & { kind: 'lathe'; profile: V2[]; at: V3; scale?: V3; seg?: number })
  | (Common & { kind: 'rod'; from: V3; to: V3; r: Expr; seg?: number })
  | (Common & { kind: 'ring'; R: Expr; r: Expr; at: V3; axis?: 'y' | 'z' })
  | (Common & { kind: 'tube'; points: V3[]; r: Expr })
  | (Common & { kind: 'panel'; from: V2; to: V2; y: Expr; h: Expr; t: Expr })
  | (Common & { kind: 'extrude'; plane: 'side' | 'plan'; profile: ProfileItem[]; depth: Expr; bevel?: Expr; at?: V3 })
  | { kind: 'repeat'; count: Expr; as?: string; let?: Record<string, Expr>; parts: RecipePart[] }
  | { kind: 'if'; when: Expr; parts: RecipePart[]; else?: RecipePart[] }
  | { kind: 'base'; mats: Partial<Record<'structure' | 'water' | 'grate', RecipeMaterial>> };

/** A plan symbol drawn by hand instead of from the parts: filled rings and lines, in the local frame (x, z) */
export type RecipePlanItem = { ring: V2[]; fill?: boolean } | { line: V2[] } | { circle: { at: V2; r: Expr }; fill?: boolean };

/** A recipe as a list of parts with expressions (the format before scripts); also what a script's output is checked as */
export interface PartRecipe {
  /** Seed for rnd(k), so random variation is the same every time */
  seed?: number;
  /** Named values, evaluated in order; later ones can use earlier ones */
  let?: Record<string, Expr>;
  parts: RecipePart[];
  /** Replaces the plan symbol derived from the parts */
  plan?: RecipePlanItem[];
}

// --- Schema ---

const expr = z.union([z.number(), z.string().min(1).max(500)]);
const v2 = z.tuple([expr, expr]);
const v3 = z.tuple([expr, expr, expr]);
const mat = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/, 'a material id')
  .max(64);
const common = { mat, plan: z.boolean().optional() };
const name = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/);
const profileItem = z.union([
  v2,
  z.object({ arc: z.tuple([expr, expr, expr, expr, expr]).or(z.tuple([expr, expr, expr, expr, expr, z.boolean()])) }),
  z.object({ curve: z.tuple([expr, expr, expr, expr]) }),
]);
export const recipePartSchema: z.ZodType<RecipePart> = z.lazy(
  () =>
    z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('box'), size: v3, at: v3, r: expr.optional(), rot: v3.optional(), ...common }),
      z.object({
        kind: z.literal('cylinder'),
        r: expr,
        r2: expr.optional(),
        h: expr,
        at: v3,
        axis: z.enum(['x', 'y', 'z']).optional(),
        scale: v3.optional(),
        seg: z.number().int().min(3).max(64).optional(),
        ...common,
      }),
      z.object({ kind: z.literal('sphere'), r: expr, at: v3, scale: v3.optional(), ...common }),
      z.object({
        kind: z.literal('lathe'),
        profile: z.array(v2).min(2).max(64),
        at: v3,
        scale: v3.optional(),
        seg: z.number().int().min(3).max(64).optional(),
        ...common,
      }),
      z.object({ kind: z.literal('rod'), from: v3, to: v3, r: expr, seg: z.number().int().min(3).max(32).optional(), ...common }),
      z.object({ kind: z.literal('ring'), R: expr, r: expr, at: v3, axis: z.enum(['y', 'z']).optional(), ...common }),
      z.object({ kind: z.literal('tube'), points: z.array(v3).min(2).max(64), r: expr, ...common }),
      z.object({ kind: z.literal('panel'), from: v2, to: v2, y: expr, h: expr, t: expr, ...common }),
      z.object({
        kind: z.literal('extrude'),
        plane: z.enum(['side', 'plan']),
        profile: z.array(profileItem).min(3).max(64),
        depth: expr,
        bevel: expr.optional(),
        at: v3.optional(),
        ...common,
      }),
      z.object({
        kind: z.literal('repeat'),
        count: expr,
        as: name.optional(),
        let: z.record(name, expr).optional(),
        parts: z.array(recipePartSchema).max(200),
      }),
      z.object({ kind: z.literal('if'), when: expr, parts: z.array(recipePartSchema).max(200), else: z.array(recipePartSchema).max(200).optional() }),
      z.object({ kind: z.literal('base'), mats: z.object({ structure: mat.optional(), water: mat.optional(), grate: mat.optional() }) }),
    ]) as z.ZodType<RecipePart>,
);
const planItem = z.union([
  z.object({ ring: z.array(v2).min(3).max(128), fill: z.boolean().optional() }),
  z.object({ line: z.array(v2).min(2).max(128) }),
  z.object({ circle: z.object({ at: v2, r: expr }), fill: z.boolean().optional() }),
]);
export const partRecipeSchema: z.ZodType<PartRecipe> = z.object({
  seed: z.number().int().optional(),
  let: z.record(name, expr).optional(),
  parts: z.array(recipePartSchema).max(300),
  plan: z.array(planItem).max(200).optional(),
});

// --- Building ---

export type Vec3 = [number, number, number];
export type BuiltProfile = (
  | { p: [number, number] }
  | { arc: [number, number, number, number, number, boolean] }
  | { curve: [number, number, number, number] }
)[];
interface BuiltCommon {
  mat: RecipeMaterial;
  plan: boolean;
}
/** A part with every expression evaluated (mm, degrees) */
export type BuiltPart =
  | (BuiltCommon & { kind: 'box'; size: Vec3; at: Vec3; r: number; rot: Vec3 })
  | (BuiltCommon & { kind: 'cylinder'; r: number; r2: number; h: number; at: Vec3; axis: 'x' | 'y' | 'z'; scale: Vec3; seg: number })
  | (BuiltCommon & { kind: 'sphere'; r: number; at: Vec3; scale: Vec3 })
  | (BuiltCommon & { kind: 'lathe'; profile: [number, number][]; at: Vec3; scale: Vec3; seg: number })
  | (BuiltCommon & { kind: 'rod'; from: Vec3; to: Vec3; r: number; seg: number })
  | (BuiltCommon & { kind: 'ring'; R: number; r: number; at: Vec3; axis: 'y' | 'z' })
  | (BuiltCommon & { kind: 'tube'; points: Vec3[]; r: number })
  | (BuiltCommon & { kind: 'panel'; from: [number, number]; to: [number, number]; y: number; h: number; t: number })
  | (BuiltCommon & { kind: 'extrude'; plane: 'side' | 'plan'; profile: BuiltProfile; depth: number; bevel: number; at: Vec3 })
  | { kind: 'base'; mats: Partial<Record<'structure' | 'water' | 'grate', RecipeMaterial>> };

export class RecipeError extends Error {}

/** Limits that keep a recipe cheap to build and draw */
export const RECIPE_LIMITS = { parts: 3000, repeat: 400, depth: 6 };

/** The object's size a recipe is built at (mm); extra names (e.g. a stair's riser count) may be added */
export type RecipeSize = { w: number; d: number; h: number } & Record<string, number>;

/** Evaluate a recipe at a size: every part with numbers, repeats and conditions expanded */
export function buildParts(recipe: PartRecipe, size: RecipeSize): BuiltPart[] {
  const seed = recipe.seed ?? 1;
  const scope: Scope = { ...size };
  const where = (path: string, f: () => void) => {
    try {
      f();
    } catch (e) {
      if (e instanceof RecipeError) throw e;
      throw new RecipeError(`${path}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  for (const [k, e] of Object.entries(recipe.let ?? {})) where(`let.${k}`, () => void (scope[k] = evalExpr(e, scope, seed)));
  const out: BuiltPart[] = [];
  const walk = (parts: RecipePart[], sc: Scope, path: string, depth: number) => {
    if (depth > RECIPE_LIMITS.depth) throw new RecipeError(`${path}: repeats and conditions nested more than ${RECIPE_LIMITS.depth} deep`);
    parts.forEach((part, i) => {
      const at = `${path}[${i}]`;
      const n = (e: Expr) => evalExpr(e, sc, seed);
      const n3 = (v: V3): Vec3 => [n(v[0]), n(v[1]), n(v[2])];
      const n2 = (v: V2): [number, number] => [n(v[0]), n(v[1])];
      const plan = 'plan' in part ? part.plan !== false : true;
      where(at, () => {
        switch (part.kind) {
          case 'repeat': {
            const count = Math.floor(n(part.count));
            if (count > RECIPE_LIMITS.repeat) throw new RecipeError(`count ${count} is over the limit of ${RECIPE_LIMITS.repeat}`);
            for (let k = 0; k < count; k++) {
              const inner: Scope = { ...sc, [part.as ?? 'i']: k };
              for (const [name, e] of Object.entries(part.let ?? {})) inner[name] = evalExpr(e, inner, seed);
              walk(part.parts, inner, `${at}.parts`, depth + 1);
            }
            return;
          }
          case 'if':
            if (n(part.when)) walk(part.parts, sc, `${at}.parts`, depth + 1);
            else if (part.else) walk(part.else, sc, `${at}.else`, depth + 1);
            return;
          case 'base':
            out.push({ kind: 'base', mats: part.mats });
            return;
          case 'box':
            out.push({
              kind: 'box',
              mat: part.mat,
              plan,
              size: n3(part.size),
              at: n3(part.at),
              r: part.r === undefined ? 0 : n(part.r),
              rot: part.rot ? n3(part.rot) : [0, 0, 0],
            });
            break;
          case 'cylinder': {
            const r = n(part.r);
            out.push({
              kind: 'cylinder',
              mat: part.mat,
              plan,
              r,
              r2: part.r2 === undefined ? r : n(part.r2),
              h: n(part.h),
              at: n3(part.at),
              axis: part.axis ?? 'y',
              scale: part.scale ? n3(part.scale) : [1, 1, 1],
              seg: part.seg ?? 24,
            });
            break;
          }
          case 'sphere':
            out.push({ kind: 'sphere', mat: part.mat, plan, r: n(part.r), at: n3(part.at), scale: part.scale ? n3(part.scale) : [1, 1, 1] });
            break;
          case 'lathe':
            out.push({
              kind: 'lathe',
              mat: part.mat,
              plan,
              profile: part.profile.map(n2),
              at: n3(part.at),
              scale: part.scale ? n3(part.scale) : [1, 1, 1],
              seg: part.seg ?? 28,
            });
            break;
          case 'rod':
            out.push({ kind: 'rod', mat: part.mat, plan, from: n3(part.from), to: n3(part.to), r: n(part.r), seg: part.seg ?? 10 });
            break;
          case 'ring':
            out.push({ kind: 'ring', mat: part.mat, plan, R: n(part.R), r: n(part.r), at: n3(part.at), axis: part.axis ?? 'y' });
            break;
          case 'tube':
            out.push({ kind: 'tube', mat: part.mat, plan, points: part.points.map(n3), r: n(part.r) });
            break;
          case 'panel':
            out.push({ kind: 'panel', mat: part.mat, plan, from: n2(part.from), to: n2(part.to), y: n(part.y), h: n(part.h), t: n(part.t) });
            break;
          case 'extrude':
            out.push({
              kind: 'extrude',
              mat: part.mat,
              plan,
              plane: part.plane,
              depth: n(part.depth),
              bevel: part.bevel === undefined ? 0 : n(part.bevel),
              at: part.at ? n3(part.at) : [0, 0, 0],
              profile: part.profile.map(p =>
                Array.isArray(p)
                  ? { p: n2(p as V2) }
                  : 'arc' in p
                    ? {
                        arc: [n(p.arc[0]), n(p.arc[1]), n(p.arc[2]), n(p.arc[3]), n(p.arc[4]), !!p.arc[5]] as [number, number, number, number, number, boolean],
                      }
                    : { curve: [n(p.curve[0]), n(p.curve[1]), n(p.curve[2]), n(p.curve[3])] as [number, number, number, number] },
              ),
            });
            break;
        }
        const last = out[out.length - 1];
        const bad = degenerate(last);
        if (bad) throw new RecipeError(bad);
      });
      if (out.length > RECIPE_LIMITS.parts) throw new RecipeError(`more than ${RECIPE_LIMITS.parts} parts`);
    });
  };
  walk(recipe.parts, scope, 'parts', 0);
  return out;
}

/** Why a built part can't be drawn, or null */
function degenerate(p: BuiltPart): string | null {
  const pos = (v: number, what: string) => (v > 0 ? null : `${what} must be positive (got ${round(v)})`);
  switch (p.kind) {
    case 'box':
      return pos(p.size[0], 'width') ?? pos(p.size[1], 'height') ?? pos(p.size[2], 'depth') ?? (p.r < 0 ? 'r must not be negative' : null);
    case 'cylinder':
      return pos(p.h, 'h') ?? (p.r < 0 || p.r2 < 0 || p.r + p.r2 <= 0 ? 'radii must not be negative, and not both 0' : null);
    case 'sphere':
      return pos(p.r, 'r');
    case 'rod':
      return pos(p.r, 'r') ?? pos(Math.hypot(p.to[0] - p.from[0], p.to[1] - p.from[1], p.to[2] - p.from[2]), 'length');
    case 'ring':
      return pos(p.R, 'R') ?? pos(p.r, 'r');
    case 'tube':
      return pos(p.r, 'r');
    case 'panel':
      return pos(p.h, 'h') ?? pos(p.t, 't') ?? pos(Math.hypot(p.to[0] - p.from[0], p.to[1] - p.from[1]), 'length');
    case 'extrude':
      return pos(p.depth, 'depth') ?? (p.bevel < 0 ? 'bevel must not be negative' : null);
    case 'lathe':
      return p.profile.some(([r]) => r < 0) ? 'profile radii must not be negative' : null;
    default:
      return null;
  }
}

const round = (v: number) => Math.round(v * 100) / 100;

/**
 * Check a recipe as the agent or a user wrote it: its shape, and that it builds at the given size and at half and twice that
 * size. Returns readable problems (empty when it's fine).
 */
export function checkParts(input: unknown, size: RecipeSize): string[] {
  const parsed = partRecipeSchema.safeParse(input);
  if (!parsed.success) return parsed.error.issues.slice(0, 10).map(i => `${i.path.join('.') || 'recipe'}: ${i.message}`);
  const problems: string[] = [];
  for (const k of [1, 0.5, 2]) {
    try {
      buildParts(parsed.data, { ...size, w: size.w * k, d: size.d * k, h: size.h * k });
    } catch (e) {
      problems.push(`at ${k === 1 ? 'its size' : `${k}× its size`}: ${e instanceof Error ? e.message : String(e)}`);
      break;
    }
  }
  return problems;
}

// --- Plan symbol ---

/** What an object looks like from above, in its local frame (x, z), drawn in order: later items cover earlier ones */
export interface PlanSymbol {
  items: { ring: Point[]; fill: boolean }[];
  lines: Point[][];
}

const circle = (cx: number, cz: number, rx: number, rz: number, n = 24): Point[] =>
  Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * rx, cz + Math.sin((i / n) * Math.PI * 2) * rz]);

/** Convex hull (monotone chain) of plan points */
export function convexHull(points: Point[]): Point[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Point[] = [],
    upper: Point[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  for (const q of [...p].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

const DEG = Math.PI / 180;
/** Rotate a point about x, then y, then z (like the renderer does) */
export function rotateXYZ([x, y, z]: Vec3, [rx, ry, rz]: Vec3): Vec3 {
  if (rx) [y, z] = [y * Math.cos(rx * DEG) - z * Math.sin(rx * DEG), y * Math.sin(rx * DEG) + z * Math.cos(rx * DEG)];
  if (ry) [x, z] = [x * Math.cos(ry * DEG) + z * Math.sin(ry * DEG), -x * Math.sin(ry * DEG) + z * Math.cos(ry * DEG)];
  if (rz) [x, y] = [x * Math.cos(rz * DEG) - y * Math.sin(rz * DEG), x * Math.sin(rz * DEG) + y * Math.cos(rz * DEG)];
  return [x, y, z];
}

/** Points along a 2D profile, its arcs and curves sampled */
export function profilePoints(profile: BuiltProfile, steps = 8): [number, number][] {
  const out: [number, number][] = [];
  for (const s of profile) {
    if ('p' in s) out.push(s.p);
    else if ('arc' in s) {
      const [cx, cy, r, a0, a1, cw] = s.arc;
      let span = a1 - a0;
      if (cw && span > 0) span -= 360;
      if (!cw && span < 0) span += 360;
      for (let i = 0; i <= steps; i++) {
        const a = (a0 + (span * i) / steps) * DEG;
        out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
    } else {
      const [qx, qy, x, y] = s.curve,
        [px, py] = out[out.length - 1] ?? [x, y];
      for (let i = 1; i <= steps; i++) {
        const t = i / steps,
          u = 1 - t;
        out.push([u * u * px + 2 * u * t * qx + t * t * x, u * u * py + 2 * u * t * qy + t * t * y]);
      }
    }
  }
  return out;
}

/** The top-down outline of one part and the height of its top, or null if it draws nothing in plan */
function footprint(p: BuiltPart): { ring: Point[]; top: number; fill: boolean } | null {
  switch (p.kind) {
    case 'box': {
      const [w, h, d] = p.size,
        corners: Vec3[] = [];
      for (const x of [-w / 2, w / 2]) for (const y of [-h / 2, h / 2]) for (const z of [-d / 2, d / 2]) corners.push(rotateXYZ([x, y, z], p.rot));
      return { ring: convexHull(corners.map(([x, , z]) => [p.at[0] + x, p.at[2] + z])), top: p.at[1] + Math.max(...corners.map(c => c[1])), fill: true };
    }
    case 'cylinder': {
      const R = Math.max(p.r, p.r2);
      if (p.axis === 'y') return { ring: circle(p.at[0], p.at[2], R * p.scale[0], R * p.scale[2]), top: p.at[1] + (p.h / 2) * p.scale[1], fill: true };
      const [hx, hz] = p.axis === 'x' ? [p.h / 2, R] : [R, p.h / 2];
      return {
        ring: [
          [p.at[0] - hx, p.at[2] - hz],
          [p.at[0] + hx, p.at[2] - hz],
          [p.at[0] + hx, p.at[2] + hz],
          [p.at[0] - hx, p.at[2] + hz],
        ],
        top: p.at[1] + R,
        fill: true,
      };
    }
    case 'sphere':
      return { ring: circle(p.at[0], p.at[2], p.r * p.scale[0], p.r * p.scale[2]), top: p.at[1] + p.r * p.scale[1], fill: true };
    case 'lathe': {
      const R = Math.max(...p.profile.map(q => q[0]));
      return { ring: circle(p.at[0], p.at[2], R * p.scale[0], R * p.scale[2]), top: p.at[1] + Math.max(...p.profile.map(q => q[1])) * p.scale[1], fill: true };
    }
    case 'rod':
      return {
        ring: convexHull([...circle(p.from[0], p.from[2], p.r, p.r, 8), ...circle(p.to[0], p.to[2], p.r, p.r, 8)]),
        top: Math.max(p.from[1], p.to[1]) + p.r,
        fill: true,
      };
    case 'ring':
      return p.axis === 'y'
        ? { ring: circle(p.at[0], p.at[2], p.R + p.r, p.R + p.r), top: p.at[1] + p.r, fill: false }
        : {
            ring: [
              [p.at[0] - p.R - p.r, p.at[2] - p.r],
              [p.at[0] + p.R + p.r, p.at[2] - p.r],
              [p.at[0] + p.R + p.r, p.at[2] + p.r],
              [p.at[0] - p.R - p.r, p.at[2] + p.r],
            ],
            top: p.at[1] + p.R + p.r,
            fill: true,
          };
    case 'panel': {
      const [ax, az] = p.from,
        [bx, bz] = p.to,
        len = Math.hypot(bx - ax, bz - az),
        nx = (-(bz - az) / len) * (p.t / 2),
        nz = ((bx - ax) / len) * (p.t / 2);
      return {
        ring: [
          [ax + nx, az + nz],
          [bx + nx, bz + nz],
          [bx - nx, bz - nz],
          [ax - nx, az - nz],
        ],
        top: p.y + p.h,
        fill: true,
      };
    }
    case 'extrude': {
      const pts = profilePoints(p.profile);
      if (p.plane === 'plan') return { ring: pts.map(([x, z]) => [p.at[0] + x, p.at[2] + z]), top: p.at[1] + p.depth + p.bevel, fill: true };
      const xs = pts.map(q => q[0]),
        x0 = Math.min(...xs) - p.bevel,
        x1 = Math.max(...xs) + p.bevel,
        hz = p.depth / 2 + p.bevel;
      return {
        ring: [
          [p.at[0] + x0, p.at[2] - hz],
          [p.at[0] + x1, p.at[2] - hz],
          [p.at[0] + x1, p.at[2] + hz],
          [p.at[0] + x0, p.at[2] + hz],
        ],
        top: p.at[1] + Math.max(...pts.map(q => q[1])) + p.bevel,
        fill: true,
      };
    }
    default:
      return null;
  }
}

/** A plan symbol drawn by hand, with numbers (what a script returns as `plan`) */
export type BuiltPlanItem =
  | { ring: [number, number][]; fill?: boolean }
  | { line: [number, number][] }
  | { circle: { at: [number, number]; r: number }; fill?: boolean };

/** The plan symbol: `plan` if given, else the built parts' outlines from above, lowest first, so higher parts cover lower ones */
export function planSymbol(parts: BuiltPart[], plan?: BuiltPlanItem[]): PlanSymbol {
  if (plan) {
    const out: PlanSymbol = { items: [], lines: [] };
    for (const it of plan) {
      if ('line' in it) out.lines.push(it.line);
      else if ('ring' in it) out.items.push({ ring: it.ring, fill: it.fill !== false });
      else out.items.push({ ring: circle(it.circle.at[0], it.circle.at[1], it.circle.r, it.circle.r), fill: it.fill !== false });
    }
    return out;
  }
  const items: { ring: Point[]; top: number; fill: boolean }[] = [],
    lines: Point[][] = [];
  for (const p of parts) {
    if (p.kind === 'base' || !p.plan) continue;
    if (p.kind === 'tube') {
      lines.push(p.points.map(([x, , z]) => [x, z]));
      continue;
    }
    const f = footprint(p);
    if (f && f.ring.length >= 3) items.push(f);
  }
  items.sort((a, b) => a.top - b.top);
  return { items: items.map(({ ring, fill }) => ({ ring, fill })), lines };
}

// --- Inspection (for the agent's self-check) ---

/** Axis-aligned bounds of a built part (mm) */
export function partBounds(p: BuiltPart): [Vec3, Vec3] | null {
  const pts: Vec3[] = [];
  const pad = (c: Vec3, r: [number, number, number]) => {
    pts.push([c[0] - r[0], c[1] - r[1], c[2] - r[2]], [c[0] + r[0], c[1] + r[1], c[2] + r[2]]);
  };
  switch (p.kind) {
    case 'box': {
      const [w, h, d] = p.size;
      for (const x of [-w / 2, w / 2])
        for (const y of [-h / 2, h / 2])
          for (const z of [-d / 2, d / 2]) {
            const [rx, ry, rz] = rotateXYZ([x, y, z], p.rot);
            pts.push([p.at[0] + rx, p.at[1] + ry, p.at[2] + rz]);
          }
      break;
    }
    case 'cylinder': {
      const R = Math.max(p.r, p.r2),
        [sx, sy, sz] = p.scale,
        half = p.h / 2;
      if (p.axis === 'y') pad(p.at, [R * sx, half * sy, R * sz]);
      else if (p.axis === 'x') pad(p.at, [half * sy, R * sx, R * sz]);
      else pad(p.at, [R * sx, R * sz, half * sy]);
      break;
    }
    case 'sphere':
      pad(p.at, [p.r * p.scale[0], p.r * p.scale[1], p.r * p.scale[2]]);
      break;
    case 'lathe': {
      const R = Math.max(...p.profile.map(q => q[0])),
        ys = p.profile.map(q => q[1]);
      pts.push(
        [p.at[0] - R * p.scale[0], p.at[1] + Math.min(...ys) * p.scale[1], p.at[2] - R * p.scale[2]],
        [p.at[0] + R * p.scale[0], p.at[1] + Math.max(...ys) * p.scale[1], p.at[2] + R * p.scale[2]],
      );
      break;
    }
    case 'rod':
      pad(p.from, [p.r, p.r, p.r]);
      pad(p.to, [p.r, p.r, p.r]);
      break;
    case 'ring':
      pad(p.at, p.axis === 'y' ? [p.R + p.r, p.r, p.R + p.r] : [p.R + p.r, p.R + p.r, p.r]);
      break;
    case 'tube':
      for (const q of p.points) pad(q, [p.r, p.r, p.r]);
      break;
    case 'panel':
      pts.push(
        [Math.min(p.from[0], p.to[0]) - p.t / 2, p.y, Math.min(p.from[1], p.to[1]) - p.t / 2],
        [Math.max(p.from[0], p.to[0]) + p.t / 2, p.y + p.h, Math.max(p.from[1], p.to[1]) + p.t / 2],
      );
      break;
    case 'extrude': {
      const q = profilePoints(p.profile),
        xs = q.map(v => v[0]),
        ys = q.map(v => v[1]),
        b = p.bevel;
      if (p.plane === 'side')
        pts.push(
          [p.at[0] + Math.min(...xs) - b, p.at[1] + Math.min(...ys) - b, p.at[2] - p.depth / 2 - b],
          [p.at[0] + Math.max(...xs) + b, p.at[1] + Math.max(...ys) + b, p.at[2] + p.depth / 2 + b],
        );
      else
        pts.push(
          [p.at[0] + Math.min(...xs) - b, p.at[1] - b, p.at[2] + Math.min(...ys) - b],
          [p.at[0] + Math.max(...xs) + b, p.at[1] + p.depth + b, p.at[2] + Math.max(...ys) + b],
        );
      break;
    }
    default:
      return null;
  }
  return [[0, 1, 2].map(k => Math.min(...pts.map(q => q[k]))) as Vec3, [0, 1, 2].map(k => Math.max(...pts.map(q => q[k]))) as Vec3];
}

export interface RecipeInspection {
  parts: number;
  /** Parts per material */
  materials: Record<string, number>;
  /** Extent of all parts (mm) */
  bounds: { x: [number, number]; y: [number, number]; z: [number, number] };
  /** Parts that stick out of the w × d footprint or above h by more than 20 mm */
  outside: string[];
  /** Parts that neither stand on the floor nor touch another part */
  floating: string[];
  /** Coarse character drawings: top (x right, z down = front), front (x right, y up), side (z right = front, y up); # is filled */
  views: { top: string; front: string; side: string };
}

/** What built parts look like at a size, for checking them without seeing them: extent, parts out of bounds or floating, rough views */
export function inspectParts(built: BuiltPart[], size: RecipeSize): RecipeInspection {
  const parts = built.filter(p => p.kind !== 'base');
  const boxes = parts.map((p, i) => ({ i, p, b: partBounds(p)! })).filter(x => x.b);
  const describe = ({ i, p }: { i: number; p: BuiltPart }) => `#${i} ${p.kind}${'mat' in p ? ` (${p.mat})` : ''}`;
  const tol = 20,
    touch = 10;
  const outside = boxes
    .filter(
      ({ b: [lo, hi] }) =>
        lo[0] < -size.w / 2 - tol || hi[0] > size.w / 2 + tol || lo[2] < -size.d / 2 - tol || hi[2] > size.d / 2 + tol || hi[1] > size.h + tol || lo[1] < -tol,
    )
    .map(describe);
  const overlaps = (a: [Vec3, Vec3], b: [Vec3, Vec3]) => [0, 1, 2].every(k => a[0][k] <= b[1][k] + touch && b[0][k] <= a[1][k] + touch);
  const floating = boxes.filter(x => x.b[0][1] > touch && !boxes.some(y => y !== x && overlaps(x.b, y.b))).map(describe);
  const materials: Record<string, number> = {};
  for (const p of parts) if ('mat' in p) materials[p.mat] = (materials[p.mat] ?? 0) + 1;
  const all = boxes.map(x => x.b);
  const ext = (k: 0 | 1 | 2): [number, number] =>
    all.length ? [Math.round(Math.min(...all.map(b => b[0][k]))), Math.round(Math.max(...all.map(b => b[1][k])))] : [0, 0];
  const draw = (u: 0 | 2, v: 1 | 2, uRange: [number, number], vRange: [number, number], flipV: boolean) => {
    const W = 32,
      H = 14,
      grid = Array.from({ length: H }, () => Array(W).fill('.'));
    for (const [lo, hi] of all) {
      const c0 = Math.floor(((lo[u] - uRange[0]) / (uRange[1] - uRange[0])) * W),
        c1 = Math.ceil(((hi[u] - uRange[0]) / (uRange[1] - uRange[0])) * W) - 1;
      let r0 = Math.floor(((lo[v] - vRange[0]) / (vRange[1] - vRange[0])) * H),
        r1 = Math.ceil(((hi[v] - vRange[0]) / (vRange[1] - vRange[0])) * H) - 1;
      if (flipV) [r0, r1] = [H - 1 - r1, H - 1 - r0];
      for (let r = Math.max(0, r0); r <= Math.min(H - 1, r1); r++) for (let c = Math.max(0, c0); c <= Math.min(W - 1, c1); c++) grid[r][c] = '#';
    }
    return grid.map(row => row.join('')).join('\n');
  };
  const xr: [number, number] = [-size.w / 2, size.w / 2],
    zr: [number, number] = [-size.d / 2, size.d / 2],
    yr: [number, number] = [0, size.h];
  return {
    parts: parts.length,
    materials,
    bounds: { x: ext(0), y: ext(1), z: ext(2) },
    outside,
    floating,
    views: { top: draw(0, 2, xr, zr, false), front: draw(0, 1, xr, yr, true), side: draw(2, 1, zr, yr, true) },
  };
}
