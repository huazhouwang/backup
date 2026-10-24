import pc from 'polygon-clipping';
import type { Furniture, Opening, Point, Polygon, Ring, Wall } from '../model/schema.js';

// ---------- Tolerances ----------

/** Positions closer than this (mm) count as the same point / line */
export const TOL = 5;
/** A wall bounds a space when they share more than this length (mm) */
export const MIN_SHARED_EDGE = 100;
/** Shortest wall that may be created (mm) */
export const MIN_WALL_LENGTH = 50;
/** Two unit directions are parallel when the magnitude of their cross product is below this */
export const PARALLEL_EPS = 1e-6;

// ---------- Vectors ----------

export const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
export const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1]];
export const scale = (a: Point, k: number): Point => [a[0] * k, a[1] * k];
export const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
export const cross = (a: Point, b: Point) => a[0] * b[1] - a[1] * b[0];
export const len = (a: Point) => Math.hypot(a[0], a[1]);
export const round = (p: Point): Point => [Math.round(p[0]), Math.round(p[1])];

// ---------- Wall centreline ----------

export const wallLength = (w: Wall) => len(sub(w.end, w.start));
export const wallDir = (w: Wall): Point => scale(sub(w.end, w.start), 1 / wallLength(w));
/** Normal: the right-hand side looking from start → end (plan north up, y south) */
export const wallNormal = (w: Wall): Point => {
  const [dx, dy] = wallDir(w);
  return [-dy, dx];
};
export const parallel = (a: Wall, b: Wall) => Math.abs(cross(wallDir(a), wallDir(b))) < PARALLEL_EPS;

export const pointAt = (w: Wall, at: number): Point => add(w.start, scale(wallDir(w), at));
export const openingCenter = (w: Wall, o: Opening) => pointAt(w, o.at);

/** Distance from a point to the wall's centreline and its projection parameter (distance along the wall) */
export function project(w: Wall, p: Point): { dist: number; at: number } {
  const d = wallDir(w),
    v = sub(p, w.start);
  return { dist: Math.abs(cross(d, v)), at: dot(v, d) };
}

/** Whether a point lies on the wall centreline (endpoints included) */
export function onWall(w: Wall, p: Point, tol = TOL) {
  const { dist, at } = project(w, p);
  return dist <= tol && at >= -tol && at <= wallLength(w) + tol;
}

// ---------- Polygons ----------

type PcPolygon = [number, number][][];

export const toPc = (p: Polygon): PcPolygon => [p.outer, ...(p.holes ?? [])].map(r => r.map(([x, y]) => [x, y] as [number, number]));

export function fromPc(mp: PcPolygon[]): Polygon[] {
  // polygon-clipping repeats the first point at the end of each ring; drop the last point
  const ring = (r: [number, number][]): Ring => r.slice(0, -1).map(([x, y]) => [x, y] as Point);
  return mp.map(([outer, ...holes]) => (holes.length ? { outer: ring(outer), holes: holes.map(ring) } : { outer: ring(outer) }));
}

export function rect(x0: number, y0: number, x1: number, y1: number): Polygon {
  return {
    outer: [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ],
  };
}

export function union(polys: Polygon[]): Polygon[] {
  if (!polys.length) return [];
  const [a, ...rest] = polys.map(toPc);
  return fromPc(pc.union(a, ...rest));
}

export function difference(a: Polygon[], b: Polygon[]): Polygon[] {
  if (!a.length) return [];
  if (!b.length) return union(a);
  return fromPc(pc.difference(a.map(toPc), ...b.map(toPc)));
}

/** Unsigned area of one ring (mm²) */
export const ringArea = (r: Ring) => {
  let s = 0;
  for (let i = 0; i < r.length; i++) {
    const [x1, y1] = r[i],
      [x2, y2] = r[(i + 1) % r.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
};

/** Area in square millimetres */
export const area = (polys: Polygon[]) => polys.reduce((s, p) => s + ringArea(p.outer) - (p.holes ?? []).reduce((h, r) => h + ringArea(r), 0), 0);

/**
 * The plan footprint a wall actually occupies. Bearing walls and partitions are extended by half their thickness at each end so corners at junctions are filled;
 * fences, parapets and railings are not extended.
 */
export function wallBody(w: Wall): Polygon {
  const d = wallDir(w),
    n = scale(wallNormal(w), w.thickness / 2);
  const e = w.kind === 'bearing' || w.kind === 'partition' ? w.thickness / 2 : 0;
  const a = sub(w.start, scale(d, e)),
    b = add(w.end, scale(d, e));
  return { outer: [add(a, n), add(b, n), sub(b, n), sub(a, n)] };
}

/** Plan footprint of a piece of furniture: its size rotated clockwise about its centre */
export function furnitureFootprint(f: Furniture): Polygon {
  const r = (f.rotation * Math.PI) / 180,
    c = Math.cos(r),
    s = Math.sin(r);
  const hw = f.size.w / 2,
    hd = f.size.d / 2;
  const corners: Point[] = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ];
  return { outer: corners.map(([x, y]) => [f.position[0] + x * c - y * s, f.position[1] + x * s + y * c]) };
}

export function bbox(polys: Polygon[]): [number, number, number, number] {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const p of polys)
    for (const [x, y] of p.outer) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  return [x0, y0, x1, y1];
}

export function pointInPolygon([x, y]: Point, p: Polygon): boolean {
  const inRing = (r: Ring) => {
    let inside = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i],
        [xj, yj] = r[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  return inRing(p.outer) && !(p.holes ?? []).some(inRing);
}
