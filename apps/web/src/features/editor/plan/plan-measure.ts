/**
 * The tape measure in the plan, as SketchUp's: a point snaps to a wall corner or a furniture corner within a few pixels, else onto
 * a wall face, else stays where it is; with Shift the second point holds the first one's horizontal or vertical line.
 */
import { furnitureFootprint, wallBody, type Point, type Project } from '@plinth/core';

/** The nearest point on segment ab to p, and its distance */
function onSegment(p: Point, a: Point, b: Point): { q: Point; d: number } {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  const q: Point = [a[0] + t * dx, a[1] + t * dy];
  return { q, d: Math.hypot(p[0] - q[0], p[1] - q[1]) };
}

/** Where a measuring point lands: a corner, else a wall face, within `tol` (mm); else the point itself */
export function snapMeasure(p: Project, level: string, at: Point, tol: number): { point: Point; snapped: 'corner' | 'face' | null } {
  const walls = p.walls.filter(w => w.level === level).map(w => wallBody(w).outer);
  const pieces = p.furniture.filter(f => f.level === level).map(f => furnitureFootprint(f).outer);
  let best: { point: Point; d: number } | null = null;
  for (const ring of [...walls, ...pieces])
    for (const c of ring) {
      const d = Math.hypot(c[0] - at[0], c[1] - at[1]);
      if (d <= tol && (!best || d < best.d)) best = { point: [c[0], c[1]], d };
    }
  if (best) return { point: best.point, snapped: 'corner' };
  let face: { point: Point; d: number } | null = null;
  for (const ring of walls)
    for (let i = 0; i < ring.length; i++) {
      const { q, d } = onSegment(at, ring[i], ring[(i + 1) % ring.length]);
      if (d <= tol && (!face || d < face.d)) face = { point: q, d };
    }
  if (face) return { point: face.point, snapped: 'face' };
  return { point: at, snapped: null };
}

/** With Shift: the second point on the first one's horizontal or vertical line, whichever is nearer */
export const holdAxis = (a: Point, b: Point): Point => (Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? [b[0], a[1]] : [a[0], b[1]]);
