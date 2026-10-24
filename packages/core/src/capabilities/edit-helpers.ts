/** Building blocks shared by edit capabilities. They mutate the draft they are given. */
import { current, isDraft } from 'immer';
import { add, cross, dot, MIN_WALL_LENGTH, PARALLEL_EPS, rect, round, scale, sub, TOL, union, wallDir, wallLength } from '../geometry/geometry.js';
import { autoWallName, nextId, uniqueName, wallSpaceSpan } from '../geometry/topology.js';
import { TxError } from '../session/session.js';
import { text } from '../i18n.js';
import { materialOf } from '../looks/builtin.js';
import { NAME_SEPARATOR, names } from '../model/names.js';
import type { Id, Opening, Point, Polygon, Project, Space, Wall } from '../model/schema.js';

export const OPENING_DEFAULTS: Record<Opening['kind'], { width: number; height: number; sill: number }> = {
  door: { width: 900, height: 2100, sill: 0 },
  'sliding-door': { width: 1800, height: 2400, sill: 0 },
  gate: { width: 1500, height: 2400, sill: 0 },
  window: { width: 1500, height: 1500, sill: 900 },
  opening: { width: 1000, height: 2400, sill: 0 },
};

export const toPolygon = (input: { rect?: number[]; polygon?: Point[] }): Polygon => {
  if (input.rect) {
    const [x, y, w, h] = input.rect;
    if (w <= 0 || h <= 0) throw new TxError('invalid-input', text('err_rect_size', 'Rectangle width and depth must be greater than 0'));
    return rect(x, y, x + w, y + h);
  }
  if (input.polygon && input.polygon.length >= 3) return { outer: input.polygon.map(round) };
  throw new TxError('invalid-input', text('err_shape_required', 'Needs rect or polygon'));
};

export function addWall(
  p: Project,
  level: Id,
  start: Point,
  end: Point,
  o: { thickness?: number; kind?: Wall['kind']; height?: number; name?: string } = {},
): Wall {
  if (Math.hypot(end[0] - start[0], end[1] - start[1]) < MIN_WALL_LENGTH)
    throw new TxError('invalid-input', text('err_wall_too_short', 'Wall too short (under 50 mm)'));
  const w: Wall = {
    id: nextId(p, `${level}-w`),
    name: '',
    level,
    start: round(start),
    end: round(end),
    thickness: o.thickness ?? (o.kind === 'bearing' ? 240 : o.kind === 'railing' ? 60 : 120),
    kind: o.kind ?? 'partition',
    openings: [],
    ...(o.height ? { height: o.height } : {}),
  };
  p.walls.push(w);
  w.name = uniqueName(
    p.walls.filter(x => x.level === level && x !== w).map(x => x.name),
    o.name ?? autoWallName(p, w),
    p.language,
  );
  return w;
}

export function addOpening(
  p: Project,
  w: Wall,
  kind: Opening['kind'],
  o: { at?: number; width?: number; height?: number; sill?: number; swing?: Opening['swing']; glassBlock?: boolean; name?: string },
): Opening {
  const d = OPENING_DEFAULTS[kind];
  const width = o.width ?? d.width;
  const at = Math.round(o.at ?? wallLength(w) / 2);
  const vocab = names(p);
  const word = o.glassBlock ? vocab.glassBlock(vocab.opening[kind]) : vocab.opening[kind];
  const taken = w.openings.map(x => x.name);
  const op: Opening = {
    id: nextId(p, `${w.id}-o`),
    name: o.name ?? uniqueName(taken, `${w.name}${NAME_SEPARATOR}${word}`, p.language),
    kind,
    at,
    width,
    height: o.height ?? d.height,
    sill: o.sill ?? d.sill,
    ...(kind === 'door' ? { swing: o.swing ?? { hinge: 'start', side: 'right' } } : {}),
    ...(o.glassBlock ? { glazing: 'glass-block' as const } : {}),
  };
  w.openings.push(op);
  return op;
}

/** Midpoint, along the wall, of the segment where a space meets the wall */
export function centerOnSpace(w: Wall, s: Space): number | null {
  const span = wallSpaceSpan(w, s);
  return span ? (span[0] + span[1]) / 2 : null;
}

/** Add walls along each polygon edge, skipping parts already covered by walls */
export function wallsAround(p: Project, level: Id, poly: Polygon, thickness: number, kind: Wall['kind']): Wall[] {
  const out: Wall[] = [];
  const ring = poly.outer;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < MIN_WALL_LENGTH) continue;
    const dir: Point = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    // Intervals covered by existing collinear walls
    const covered: [number, number][] = [];
    for (const w of p.walls) {
      if (w.level !== level) continue;
      const wd = wallDir(w);
      if (Math.abs(cross(wd, dir)) > PARALLEL_EPS) continue;
      const off = Math.abs(cross(sub(w.start, a), dir));
      if (off > TOL) continue;
      const t1 = dot(sub(w.start, a), dir),
        t2 = dot(sub(w.end, a), dir);
      covered.push([Math.max(0, Math.min(t1, t2)), Math.min(L, Math.max(t1, t2))]);
    }
    covered.sort((x, y) => x[0] - y[0]);
    let t = 0;
    const gaps: [number, number][] = [];
    for (const [lo, hi] of covered) {
      if (lo > t + TOL) gaps.push([t, lo]);
      t = Math.max(t, hi);
    }
    if (t < L - TOL) gaps.push([t, L]);
    for (const [lo, hi] of gaps)
      if (hi - lo >= MIN_WALL_LENGTH) out.push(addWall(p, level, add(a, scale(dir, lo)), add(a, scale(dir, hi)), { thickness, kind }));
  }
  return out;
}

/** Register a floor material that neither the design nor the default library has (plain grey, named after its key) */
export function ensureMaterial(p: Project, floor: string) {
  if (!materialOf(floor, null, p.library.materials)) {
    p.library.materials[floor] = {
      name: { [p.language]: floor },
      pbrMetallicRoughness: { baseColorFactor: [0.8, 0.8, 0.8, 1], metallicFactor: 0, roughnessFactor: 0.9 },
    };
  }
}

/** Rename a wall, made unique on its level; openings named after the wall (“wall·Door”) follow */
export function setWallName(p: Project, w: Wall, name: string) {
  const old = w.name;
  w.name = uniqueName(
    p.walls.filter(x => x.level === w.level && x !== w).map(x => x.name),
    name,
    p.language,
  );
  for (const o of w.openings) if (o.name.startsWith(`${old}${NAME_SEPARATOR}`)) o.name = w.name + o.name.slice(old.length);
}

export function addSpace(p: Project, level: Id, name: string, shape: Polygon[], kind: Space['kind'], floor: string): Space {
  ensureMaterial(p, floor);
  const s: Space = {
    id: nextId(p, `${level}-s`),
    name: uniqueName(
      p.spaces.filter(x => x.level === level).map(x => x.name),
      name,
      p.language,
    ),
    level,
    kind,
    shape: union(shape),
    floor,
  };
  p.spaces.push(s);
  return s;
}

/** Refresh auto-generated names after wall changes: only renames walls whose names are still auto-generated */
export function renameWalls(p: Project, level: Id) {
  // Work out names from a plain snapshot: reading geometry through the draft's proxies is several times slower
  const snap = isDraft(p) ? current(p) : p;
  const bases = new Map(snap.walls.filter(x => x.level === level).map(w => [w.id, autoWallName(snap, w)]));
  for (const w of p.walls.filter(x => x.level === level)) {
    if ((w.extras as any)?.customName) continue;
    const base = bases.get(w.id)!;
    if (w.name === base || w.name.startsWith(base)) continue;
    setWallName(p, w, base);
  }
}
