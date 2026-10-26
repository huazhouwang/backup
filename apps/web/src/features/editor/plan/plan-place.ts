/**
 * Placing from the add palette, as SketchUp places a component: what is being placed follows the pointer in the plan, and a
 * click puts it down with the capability call that makes it. Furniture at its default size, on a 50 mm step, pushed out of any
 * wall it would stand in, its centre on a widget's snap point (a grid's intersection) when near one; a door or window onto the
 * nearest wall it can go in, snapped to the wall's middle.
 */
import { dot, OPENING_DEFAULTS, pointAt, sub, wallDir, wallLength, wallNormal, type Point, type Project, type Wall } from '@plinth/core';
import type { Placing } from '../store/types';

export interface PlaceResult {
  name: string;
  input: Record<string, unknown>;
  /** The outline of what would be placed */
  ghost: Point[];
}

const STEP = 50;
const snap = (v: number) => Math.round(v / STEP) * STEP;
/** How far from a wall's centreline a door or window still finds it (mm, beyond half its thickness) */
const WALL_REACH = 600;
/** Kinds of wall each opening goes in: gates in fences, the rest in storey walls */
const HOSTS: Record<string, Wall['kind'][]> = { gate: ['fence', 'parapet'] };
const STOREY: Wall['kind'][] = ['bearing', 'partition'];

/** A rectangle along a wall: from a to b along it, as thick as the wall */
function along(w: Wall, a: number, b: number): Point[] {
  const n = wallNormal(w),
    h = w.thickness / 2;
  const p = pointAt(w, a),
    q = pointAt(w, b);
  return [
    [p[0] + n[0] * h, p[1] + n[1] * h],
    [q[0] + n[0] * h, q[1] + n[1] * h],
    [q[0] - n[0] * h, q[1] - n[1] * h],
    [p[0] - n[0] * h, p[1] - n[1] * h],
  ];
}

/** Push an axis-aligned box out of the walls it overlaps, towards the side its centre is on (one pass per wall) */
function clearOfWalls(walls: Wall[], c: Point, w: number, d: number): Point {
  const out: Point = [c[0], c[1]];
  for (const wall of walls) {
    const [dx, dy] = wallDir(wall);
    const horizontal = Math.abs(dy) < 1e-3,
      vertical = Math.abs(dx) < 1e-3;
    if (!horizontal && !vertical) continue;
    const i = horizontal ? 1 : 0;
    const lo = Math.min(wall.start[1 - i], wall.end[1 - i]),
      hi = Math.max(wall.start[1 - i], wall.end[1 - i]);
    const half = (horizontal ? w : d) / 2,
      depth = (horizontal ? d : w) / 2;
    // Overlaps the wall along it, and across it
    if (out[1 - i] + half <= lo || out[1 - i] - half >= hi) continue;
    const face = wall.start[i],
      t = wall.thickness / 2;
    if (Math.abs(out[i] - face) >= t + depth) continue;
    out[i] = out[i] >= face ? face + t + depth : face - t - depth;
  }
  return out;
}

export function placeCall(p: Project, level: string, placing: Placing, at: Point, tol: number, snaps: Point[] = []): PlaceResult | null {
  const walls = p.walls.filter(w => w.level === level);
  if (placing.kind === 'furniture') {
    const size = p.library.furniture[placing.type]?.size ?? { w: 600, d: 600, h: 750 };
    const near = snaps.reduce<Point | null>(
      (b, s) => (Math.hypot(s[0] - at[0], s[1] - at[1]) < (b ? Math.hypot(b[0] - at[0], b[1] - at[1]) : tol) ? s : b),
      null,
    );
    const c = clearOfWalls(
      walls.filter(w => STOREY.includes(w.kind)),
      near ? [near[0], near[1]] : [snap(at[0]), snap(at[1])],
      size.w,
      size.d,
    );
    const [hw, hd] = [size.w / 2, size.d / 2];
    return {
      name: 'furniture_add',
      input: { level, type: placing.type, position: c },
      ghost: [
        [c[0] - hw, c[1] - hd],
        [c[0] + hw, c[1] - hd],
        [c[0] + hw, c[1] + hd],
        [c[0] - hw, c[1] + hd],
      ],
    };
  }
  const kinds = HOSTS[placing.opening] ?? STOREY;
  const width = OPENING_DEFAULTS[placing.opening].width;
  let best: { w: Wall; at: number; dist: number } | null = null;
  for (const w of walls) {
    if (!kinds.includes(w.kind)) continue;
    const L = wallLength(w);
    if (L < width + 100) continue;
    const rel = sub(at, w.start);
    const t = dot(rel, wallDir(w)),
      dist = Math.abs(dot(rel, wallNormal(w)));
    if (t < 0 || t > L || dist > w.thickness / 2 + WALL_REACH) continue;
    if (!best || dist < best.dist) best = { w, at: t, dist };
  }
  if (!best) return null;
  const L = wallLength(best.w);
  let c = Math.min(Math.max(snap(best.at), width / 2 + 50), L - width / 2 - 50);
  if (Math.abs(c - L / 2) < tol) c = L / 2;
  return { name: 'opening_add', input: { wall: best.w.id, kind: placing.opening, at: Math.round(c) }, ghost: along(best.w, c - width / 2, c + width / 2) };
}
