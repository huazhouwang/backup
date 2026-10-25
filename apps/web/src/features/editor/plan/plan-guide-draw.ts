/**
 * Drawing guides with the tape measure in the plan, as SketchUp's: dragging off an edge (a wall face, a model axis, another guide)
 * draws a guide parallel to it, the offset following the pointer on a 10 mm step; dragging off a corner (a wall or furniture
 * corner, the origin, a guide crossing) draws a guide along the axis the pointer follows, with a guide point at its end.
 */
import { furnitureFootprint, wallBody, type Point, type Project } from '@plinth/core';
import { crossing, planGuideLines, planGuidePoints } from './plan-guides';

export type GuideSource = { kind: 'edge'; a: Point; b: Point } | { kind: 'corner'; at: Point };

/** How far a model axis or guide reaches as an edge to drag off (mm) */
const REACH = 1e6;

/** What a guide can be dragged off on a level: wall faces, the axes and guide lines as edges; corners and crossings */
export function guideSources(p: Project, level: string): { edges: [Point, Point][]; corners: Point[] } {
  const edges: [Point, Point][] = [];
  const corners: Point[] = [[0, 0]];
  for (const w of p.walls.filter(x => x.level === level)) {
    const ring = wallBody(w).outer;
    ring.forEach((q, i) => {
      edges.push([q, ring[(i + 1) % ring.length]]);
      corners.push(q);
    });
  }
  for (const f of p.furniture.filter(x => x.level === level)) corners.push(...furnitureFootprint(f).outer);
  edges.push(
    [
      [-REACH, 0],
      [REACH, 0],
    ],
    [
      [0, -REACH],
      [0, REACH],
    ],
  );
  const lines = planGuideLines(p);
  for (const l of lines)
    edges.push([
      [l.at[0] - l.dir[0] * REACH, l.at[1] - l.dir[1] * REACH],
      [l.at[0] + l.dir[0] * REACH, l.at[1] + l.dir[1] * REACH],
    ]);
  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++) {
      const c = crossing(lines[i], lines[j]);
      if (c) corners.push(c);
    }
  corners.push(...planGuidePoints(p).map(g => g.at));
  return { edges, corners };
}

const STEP = 10;
const step = (v: number) => Math.round(v / STEP) * STEP;

export interface GuideDraft {
  /** The calls that make it: a line, and for a corner a point at its end */
  calls: { name: string; input: Record<string, unknown> }[];
  /** What to draw meanwhile: the line (through at along dir) and the point */
  line: { at: Point; dir: Point };
  point: Point | null;
  /** The offset or distance, mm */
  distance: number;
  /** Where the offset is measured from and which way, for typing an exact one afterwards */
  origin: Point;
  normal: Point;
}

/** The guide a drag from `src` to `to` (mm) draws on `level`; null before it has moved off */
export function guideDraft(src: GuideSource, to: Point, level: string): GuideDraft | null {
  if (src.kind === 'edge') {
    const len = Math.hypot(src.b[0] - src.a[0], src.b[1] - src.a[1]);
    const dir: Point = [(src.b[0] - src.a[0]) / len, (src.b[1] - src.a[1]) / len];
    const normal: Point = [-dir[1], dir[0]];
    // Measured from the edge's line, through the point nearest to where the drag started
    const off = step((to[0] - src.a[0]) * normal[0] + (to[1] - src.a[1]) * normal[1]);
    if (!off) return null;
    const at: Point = [Math.round(src.a[0] + normal[0] * off), Math.round(src.a[1] + normal[1] * off)];
    return {
      calls: [{ name: 'guide_add', input: { at, direction: [dir[0], dir[1], 0], level } }],
      line: { at, dir },
      point: null,
      distance: Math.abs(off),
      origin: src.a,
      normal,
    };
  }
  const dx = to[0] - src.at[0],
    dy = to[1] - src.at[1];
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const d = step(horizontal ? dx : dy);
  if (!d) return null;
  const axis: Point = horizontal ? [Math.sign(d), 0] : [0, Math.sign(d)];
  const end: Point = horizontal ? [src.at[0] + d, src.at[1]] : [src.at[0], src.at[1] + d];
  return {
    calls: [
      { name: 'guide_add', input: { at: src.at, direction: horizontal ? 'x' : 'y', level } },
      { name: 'guide_add', input: { kind: 'point', at: end, level } },
    ],
    line: { at: src.at, dir: horizontal ? [1, 0] : [0, 1] },
    point: end,
    distance: Math.abs(d),
    origin: src.at,
    normal: axis,
  };
}

/** The source under the pointer within `tol` (mm): a corner first, then the nearest edge (the drag starts from its nearest point) */
export function sourceAt(sources: { edges: [Point, Point][]; corners: Point[] }, q: Point, tol: number): GuideSource | null {
  let corner: { at: Point; d: number } | null = null;
  for (const c of sources.corners) {
    const d = Math.hypot(c[0] - q[0], c[1] - q[1]);
    if (d <= tol && (!corner || d < corner.d)) corner = { at: c, d };
  }
  if (corner) return { kind: 'corner', at: corner.at };
  let edge: { a: Point; b: Point; d: number } | null = null;
  for (const [a, b] of sources.edges) {
    const len2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
    if (!len2) continue;
    const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * (b[0] - a[0]) + (q[1] - a[1]) * (b[1] - a[1])) / len2));
    const f: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const d = Math.hypot(q[0] - f[0], q[1] - f[1]);
    if (d <= tol && (!edge || d < edge.d)) edge = { a: f, b: [f[0] + (b[0] - a[0]), f[1] + (b[1] - a[1])], d };
  }
  return edge && { kind: 'edge', a: edge.a, b: edge.b };
}
