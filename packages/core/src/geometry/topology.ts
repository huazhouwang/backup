/** Geometric relations between walls, spaces and openings: adjacency, location, linked moves. */
import pc from 'polygon-clipping';
import { netArea } from './area.js';
import {
  add,
  area,
  bbox,
  cross,
  dot,
  furnitureFootprint,
  MIN_SHARED_EDGE,
  onWall,
  openingCenter,
  PARALLEL_EPS,
  pointAt,
  pointInPolygon,
  project,
  round,
  scale,
  sub,
  toPc,
  TOL,
  union,
  wallBody,
  wallDir,
  wallLength,
  wallNormal,
} from './geometry.js';
import { directionOf, names } from '../model/names.js';
import type { Id, Opening, Point, Polygon, Project, ProjectLanguage, Space, Wall } from '../model/schema.js';

/** Intersection of two lines (null when parallel) */
export function intersectLines(p1: Point, d1: Point, p2: Point, d2: Point): Point | null {
  const den = cross(d1, d2);
  if (Math.abs(den) < 1e-9) return null;
  const t = cross(sub(p2, p1), d2) / den;
  return add(p1, scale(d1, t));
}

const edges = (p: Polygon): [Point, Point][] => [p.outer, ...(p.holes ?? [])].flatMap(r => r.map((a, i) => [a, r[(i + 1) % r.length]] as [Point, Point]));

/** Intervals (distance along the wall, clamped to it) where the wall centreline runs along the space boundary */
export function wallSpaceSegments(w: Wall, s: Space, tol = TOL): [number, number][] {
  const d = wallDir(w),
    L = wallLength(w);
  const out: [number, number][] = [];
  for (const poly of s.shape)
    for (const [a, b] of edges(poly)) {
      const pa = project(w, a),
        pb = project(w, b);
      if (pa.dist > tol || pb.dist > tol) continue;
      if (Math.abs(cross(d, sub(b, a))) > tol * 2) continue;
      const lo = Math.max(0, Math.min(pa.at, pb.at)),
        hi = Math.min(L, Math.max(pa.at, pb.at));
      if (hi > lo) out.push([lo, hi]);
    }
  return out;
}

/** Length where a wall coincides with a space boundary */
export const sharedLength = (w: Wall, s: Space, tol = TOL) => wallSpaceSegments(w, s, tol).reduce((n, [lo, hi]) => n + hi - lo, 0);

/** Overall extent along the wall of where it meets the space, from the first shared point to the last; null if they don't meet */
export function wallSpaceSpan(w: Wall, s: Space): [number, number] | null {
  const segs = wallSpaceSegments(w, s);
  return segs.length ? [Math.min(...segs.map(x => x[0])), Math.max(...segs.map(x => x[1]))] : null;
}

export const centroid = (s: Space): Point => {
  let x = 0,
    y = 0,
    n = 0;
  for (const p of s.shape)
    for (const [px, py] of p.outer) {
      x += px;
      y += py;
      n++;
    }
  return [x / n, y / n];
};

/** Which side of the wall the space is on: 1 along the normal, -1 opposite */
export function sideOf(w: Wall, s: Space): 1 | -1 {
  // Probe a small step to each side of the wall midpoint along the normal and see which falls inside the space
  const L = wallLength(w),
    n = wallNormal(w);
  const samples = [0.25, 0.5, 0.75].map(t => pointAt(w, L * t));
  const probe = (k: number) => samples.filter(m => s.shape.some(p => pointInPolygon(add(m, scale(n, k * 50)), p))).length;
  return probe(1) >= probe(-1) ? 1 : -1;
}

export interface SpaceBoundary {
  wall: Wall;
  length: number;
  side: 1 | -1;
}

/** Walls enclosing a space */
export function spaceWalls(p: Project, s: Space): SpaceBoundary[] {
  return p.walls
    .filter(w => w.level === s.level)
    .map(w => ({ wall: w, length: sharedLength(w, s) }))
    .filter(b => b.length > MIN_SHARED_EDGE)
    .map(b => ({ ...b, side: sideOf(b.wall, s) }));
}

/** Spaces adjacent directly or across a wall */
export function spaceNeighbors(p: Project, s: Space): { space: Space; via: Wall[] }[] {
  const mine = spaceWalls(p, s);
  const out: { space: Space; via: Wall[] }[] = [];
  for (const o of p.spaces) {
    if (o.id === s.id || o.level !== s.level) continue;
    const via = mine.filter(b => sharedLength(b.wall, o) > MIN_SHARED_EDGE).map(b => b.wall);
    if (via.length) out.push({ space: o, via });
  }
  return out;
}

/** The spaces on either side connected by an opening */
export function openingSpaces(p: Project, w: Wall, o: Opening): Space[] {
  const c = openingCenter(w, o),
    n = wallNormal(w),
    off = w.thickness / 2 + 100;
  return [1, -1]
    .map(k => p.spaces.find(s => s.level === w.level && s.shape.some(poly => pointInPolygon(add(c, scale(n, k * off)), poly))))
    .filter((s): s is Space => !!s);
}

/** Name a wall after the spaces on its sides (consistent with legacy import): the indoor space with the longest shared edge wins. Names follow the project language. */
export function autoWallName(p: Project, w: Wall): string {
  const rank: Record<Space['kind'], number> = { indoor: 3, 'semi-outdoor': 2, 'roof-terrace': 1, outdoor: 1, void: 0 };
  let best: { s: Space; score: number } | null = null;
  const indoorSides = new Map<number, number>();
  const [x0, x1] = [Math.min(w.start[0], w.end[0]) - TOL, Math.max(w.start[0], w.end[0]) + TOL];
  const [y0, y1] = [Math.min(w.start[1], w.end[1]) - TOL, Math.max(w.start[1], w.end[1]) + TOL];
  for (const s of p.spaces) {
    if (s.level !== w.level) continue;
    // A space whose bounding box doesn't reach the wall can't share an edge with it
    const b = bbox(s.shape);
    if (b[0] > x1 || b[2] < x0 || b[1] > y1 || b[3] < y0) continue;
    const l = sharedLength(w, s);
    if (l <= 0) continue;
    const side = sideOf(w, s);
    if (s.kind === 'indoor') indoorSides.set(side, (indoorSides.get(side) ?? 0) + 1);
    const score = rank[s.kind] * 1e6 + l;
    if (!best || score > best.score) best = { s, score };
  }
  const vocab = names(p);
  const word = vocab.wall[w.kind];
  if (!best) return vocab.levelWall(w.level, word);
  // Which direction the wall lies from the space: the direction from the space toward the wall
  const n = scale(wallNormal(w), -sideOf(w, best.s));
  // Only walls within about 30° of an axis get a direction in their name
  const dir = Math.min(Math.abs(n[0]), Math.abs(n[1])) < 0.5 ? directionOf(n) : null;
  if ((w.kind === 'bearing' || w.kind === 'partition') && indoorSides.size === 1 && [...indoorSides.values()][0] > 1) return vocab.exteriorWall(dir);
  return vocab.spaceWall(best.s.name, dir, word);
}

/** Append a number when a name repeats within a level: 客厅北墙（2） in a Chinese project, "Living room north wall (2)" in an English one */
export function uniqueName(existing: Iterable<string>, base: string, language: ProjectLanguage = 'zh'): string {
  const set = new Set(existing);
  if (!set.has(base)) return base;
  const vocab = names(language);
  for (let i = 2; ; i++) if (!set.has(vocab.numbered(base, i))) return vocab.numbered(base, i);
}

/** Generate a new ID: prefix + incrementing number */
export function nextId(p: Project, prefix: string): Id {
  const all = new Set<string>([
    ...p.levels.map(o => o.id),
    ...p.walls.map(o => o.id),
    ...p.walls.flatMap(w => w.openings.map(o => o.id)),
    ...p.spaces.map(o => o.id),
    ...p.elements.map(o => o.id),
    ...p.furniture.map(o => o.id),
    ...p.constraints.map(o => o.id),
    ...p.decisions.map(o => o.id),
  ]);
  for (let i = 1; ; i++) {
    const id = `${prefix}${String(i).padStart(2, '0')}`;
    if (!all.has(id)) return id;
  }
}

/**
 * Translate a wall with linked adjustments: walls whose endpoints rest on it stretch to the new position, its own endpoints slide along the walls they rest on,
 * space vertices on the wall line move with it, and openings on walls whose start point moved keep their absolute position. Mutates the input data.
 */
export function moveWall(p: Project, wallId: Id, v: Point) {
  const w = p.walls.find(x => x.id === wallId)!;
  const old = { start: w.start, end: w.end };
  const oldWall: Wall = { ...w, ...old };
  // Furniture against the wall, or mounted on it, moves with it (BIM's "moves with nearby elements")
  for (const f of furnitureAgainst(p, oldWall)) f.position = round(add(f.position, v));
  const d = wallDir(oldWall);
  const others = p.walls.filter(o => o.level === w.level && o.id !== w.id);

  // This wall's endpoints: if resting on a non-parallel wall, slide along that wall
  const slide = (pt: Point): Point => {
    const moved = add(pt, v);
    const host = others.find(o => Math.abs(cross(wallDir(o), d)) > PARALLEL_EPS && onWall(o, pt));
    if (!host) return moved;
    return intersectLines(moved, d, host.start, wallDir(host)) ?? moved;
  };
  w.start = round(slide(old.start));
  w.end = round(slide(old.end));

  // Other walls with endpoints on this wall: stretch to the new wall line
  for (const o of others) {
    const od = wallDir(o);
    if (Math.abs(cross(od, d)) < PARALLEL_EPS) continue;
    for (const key of ['start', 'end'] as const) {
      if (!onWall(oldWall, o[key])) continue;
      const hit = intersectLines(o.start, od, w.start, d);
      if (!hit) continue;
      const before = o.start;
      o[key] = round(hit);
      if (key === 'start') {
        const shift = dot(sub(o.start, before), od);
        for (const op of o.openings) op.at = Math.round(op.at - shift);
      }
    }
  }

  // Space vertices on the old wall line (including its extension within the wall thickness) move along
  const ext = w.thickness;
  for (const s of p.spaces) {
    if (s.level !== w.level) continue;
    let moved = false;
    for (const poly of s.shape)
      for (const ring of [poly.outer, ...(poly.holes ?? [])]) {
        for (let i = 0; i < ring.length; i++) {
          const pr = project(oldWall, ring[i]);
          if (pr.dist <= TOL && pr.at >= -ext && pr.at <= wallLength(oldWall) + ext) {
            ring[i] = round(add(ring[i], v));
            moved = true;
          }
        }
      }
    // Only tidy spaces that moved, so the whole level isn't recorded as "changed"
    if (moved) s.shape = union(s.shape);
  }
}

/** How close furniture must be to a wall face to count as standing against it (mm) */
const AGAINST = 30;

/** Furniture on a wall's level standing against it or mounted on it: its footprint within a few centimetres of the wall body */
export function furnitureAgainst(p: Project, w: Wall): Project['furniture'] {
  const zone = toPc(wallBody({ ...w, thickness: w.thickness + 2 * AGAINST }));
  return p.furniture.filter(f => f.level === w.level && pc.intersection([zone], [toPc(furnitureFootprint(f))]).length > 0);
}

/** Usable area of a space (m²); see area.ts */
export const spaceNetArea = (p: Project, s: Space) => netArea(s, p.walls);

/** Overlap area of two polygon sets (mm²) */
export function overlapArea(a: Polygon[], b: Polygon[]) {
  if (!a.length || !b.length) return 0;
  return area(
    pc.intersection(a.map(toPc), b.map(toPc)).map(([outer, ...holes]) => ({
      outer: outer.slice(0, -1) as Point[],
      holes: holes.map(h => h.slice(0, -1) as Point[]),
    })),
  );
}
