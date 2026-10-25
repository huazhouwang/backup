/**
 * Guides on the plan (see Guide in the core schema): a guide line with a level direction stands for a vertical plane, so it shows
 * on every level as a line without end; a point, or a line straight up, shows where it stands. Things drawn, dragged, placed and
 * measured snap to the guides and to where they cross, as in SketchUp.
 */
import { wallDir, type Point, type Project, type Wall } from '@plinth/core';

export interface PlanGuideLine {
  id: string;
  at: Point;
  /** Unit direction on the plan */
  dir: Point;
}

/** The guide lines that show on the plan as lines */
export function planGuideLines(p: Project): PlanGuideLine[] {
  return (p.guides ?? []).flatMap(g => {
    if (g.kind !== 'line' || !g.dir || Math.abs(g.dir[2]) > 1e-6) return [];
    const len = Math.hypot(g.dir[0], g.dir[1]);
    return len ? [{ id: g.id, at: [g.at[0], g.at[1]] as Point, dir: [g.dir[0] / len, g.dir[1] / len] as Point }] : [];
  });
}

/** Guide points, and lines straight up, where they stand on the plan */
export function planGuidePoints(p: Project): { id: string; at: Point }[] {
  return (p.guides ?? []).filter(g => g.kind === 'point' || (g.dir && Math.abs(g.dir[2]) > 1 - 1e-6)).map(g => ({ id: g.id, at: [g.at[0], g.at[1]] }));
}

const cross = (a: Point, b: Point) => a[0] * b[1] - a[1] * b[0];

/** Where two lines cross, or null when they are parallel */
export function crossing(a: PlanGuideLine, b: PlanGuideLine): Point | null {
  const den = cross(a.dir, b.dir);
  if (Math.abs(den) < 1e-9) return null;
  const t = cross([b.at[0] - a.at[0], b.at[1] - a.at[1]], b.dir) / den;
  return [a.at[0] + a.dir[0] * t, a.at[1] + a.dir[1] * t];
}

/** The point of a line nearest to q, and how far it is */
export function onLine(l: PlanGuideLine, q: Point): { q: Point; d: number } {
  const t = (q[0] - l.at[0]) * l.dir[0] + (q[1] - l.at[1]) * l.dir[1];
  const f: Point = [l.at[0] + l.dir[0] * t, l.at[1] + l.dir[1] * t];
  return { q: f, d: Math.hypot(q[0] - f[0], q[1] - f[1]) };
}

/**
 * Where a point snaps on the guides within `tol` (mm): a crossing of two guides or a guide point first ('corner'), else the
 * nearest guide line ('face'); null when no guide is near
 */
export function snapToGuides(p: Project, at: Point, tol: number): { point: Point; snapped: 'corner' | 'face' } | null {
  const lines = planGuideLines(p);
  const corners = planGuidePoints(p).map(g => g.at);
  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++) {
      const c = crossing(lines[i], lines[j]);
      if (c) corners.push(c);
    }
  let best: { point: Point; d: number } | null = null;
  for (const c of corners) {
    const d = Math.hypot(c[0] - at[0], c[1] - at[1]);
    if (d <= tol && (!best || d < best.d)) best = { point: c, d };
  }
  if (best) return { point: best.point, snapped: 'corner' };
  let face: { point: Point; d: number } | null = null;
  for (const l of lines) {
    const { q, d } = onLine(l, at);
    if (d <= tol && (!face || d < face.d)) face = { point: q, d };
  }
  return face && { point: face.point, snapped: 'face' };
}

/** A line without end clipped to a rectangle [x, y, w, h], for drawing; null when it misses */
export function clipLine(l: PlanGuideLine, [x, y, w, h]: [number, number, number, number]): [Point, Point] | null {
  let t0 = -Infinity,
    t1 = Infinity;
  for (const [o, d, lo, hi] of [
    [l.at[0], l.dir[0], x, x + w],
    [l.at[1], l.dir[1], y, y + h],
  ] as const) {
    if (Math.abs(d) < 1e-12) {
      if (o < lo || o > hi) return null;
      continue;
    }
    const a = (lo - o) / d,
      b = (hi - o) / d;
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
  }
  if (t0 > t1) return null;
  return [
    [l.at[0] + l.dir[0] * t0, l.at[1] + l.dir[1] * t0],
    [l.at[0] + l.dir[0] * t1, l.at[1] + l.dir[1] * t1],
  ];
}

/** Positions along a wall (from its start) where guide lines cross its centreline, shifted by each of `offsets` (e.g. half a width) */
export function guideStops(p: Project, w: Wall, offsets: number[] = [0]): number[] {
  const line: PlanGuideLine = { id: w.id, at: w.start, dir: wallDir(w) };
  return planGuideLines(p).flatMap(g => {
    const c = crossing(line, g);
    if (!c) return [];
    const s = (c[0] - w.start[0]) * line.dir[0] + (c[1] - w.start[1]) * line.dir[1];
    return offsets.map(o => s + o);
  });
}
