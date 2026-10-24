/**
 * Plan dimensions, derived from the model the way BIM tools generate them (never stored, so they follow every change). Outside
 * the drawing, each side gets the three chains of the Chinese drafting standard (GB/T 50104), from the walls outwards: detail
 * (doors and windows between the axes), axes (the centrelines of the walls that meet that façade) and the overall size (outer face
 * to outer face); fences and parapets reaching beyond the building add an overall line of their own. A selected object gets
 * temporary dimensions, as in Revit: a wall its length, a door or window its width and distances to the wall's ends, furniture
 * its distance to the nearest walls. Only walls parallel to the drawing's axes are dimensioned. Millimetres, y pointing south.
 */
import { furnitureFootprint, pointInPolygon, wallDir, wallLength, wallNormal, type Furniture, type Point, type Project, type Wall } from '@plinth/core';

/** A chain of dimensions on one line: marks along `dir` from `origin`, the values written on the `normal` side */
export interface DimChain {
  origin: Point;
  /** Unit vector along the line */
  dir: Point;
  /** Unit vector across it, away from what is measured: the values and the extension lines' free ends are on this side */
  normal: Point;
  /** Positions of the marks along the line, from `origin`, increasing */
  marks: number[];
  /** How far the extension lines reach back towards what is measured */
  ext: number;
}

type Side = 'top' | 'bottom' | 'left' | 'right';
const SIDES: Side[] = ['top', 'bottom', 'left', 'right'];
/** Outward direction of each side of the drawing (y points south, down the page) */
const OUT: Record<Side, Point> = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] };

const STOREY = new Set<Wall['kind']>(['bearing', 'partition']);
const ENCLOSURE = new Set<Wall['kind']>(['fence', 'parapet']);
/** Marks closer than this are one (mm) */
const SAME = 30;

/** Whether a wall runs along x (horizontal on the page), along y, or neither */
function orientation(w: Wall): 'x' | 'y' | null {
  const [dx, dy] = wallDir(w);
  if (Math.abs(dy) < 1e-3) return 'x';
  if (Math.abs(dx) < 1e-3) return 'y';
  return null;
}

/** A wall's extent along an axis (its centreline) and its position across it */
function span(w: Wall, axis: 'x' | 'y') {
  const i = axis === 'x' ? 0 : 1;
  return { lo: Math.min(w.start[i], w.end[i]), hi: Math.max(w.start[i], w.end[i]), at: w.start[1 - i] };
}

/** Sorted marks with near-duplicates merged */
function marks(values: number[]) {
  const out: number[] = [];
  for (const v of [...values].sort((a, b) => a - b)) if (!out.length || v - out[out.length - 1] > SAME) out.push(v);
  return out;
}

/** The extent along an axis of walls' bodies, ends included (a wall's body reaches half its thickness past its centreline's ends) */
function extent(walls: Wall[], axis: 'x' | 'y'): [number, number] | null {
  if (!walls.length) return null;
  let lo = Infinity,
    hi = -Infinity;
  for (const w of walls) {
    const s = span(w, axis);
    lo = Math.min(lo, s.lo - w.thickness / 2);
    hi = Math.max(hi, s.hi + w.thickness / 2);
  }
  return [lo, hi];
}

/**
 * The walls of a level that make up a side's façade: storey walls along that side with nothing of the building beyond them (a ray
 * outwards from their middle meets no other storey wall), so a courtyard's walls inside the house don't count
 */
function facade(walls: Wall[], side: Side) {
  const axis = side === 'top' || side === 'bottom' ? 'x' : 'y';
  const i = axis === 'x' ? 0 : 1;
  const sign = side === 'bottom' || side === 'right' ? 1 : -1;
  return walls.filter(w => {
    if (orientation(w) !== axis) return false;
    const s = span(w, axis),
      mid = (s.lo + s.hi) / 2;
    const beyond = (across: number) => (across - s.at) * sign > w.thickness / 2 + 1;
    return !walls.some(o => {
      if (o === w) return false;
      if (orientation(o) === axis) {
        // A parallel wall farther out, over the ray
        const os = span(o, axis);
        return mid >= os.lo - o.thickness / 2 && mid <= os.hi + o.thickness / 2 && beyond(os.at);
      }
      // A wall across the axis on the ray, reaching out beyond the façade
      return Math.abs(o.start[i] - mid) <= o.thickness / 2 && (beyond(o.start[1 - i]) || beyond(o.end[1 - i]));
    });
  });
}

/** Positions along the side's axis of the walls meeting a façade wall (their centrelines), and of the façade's ends */
function axesOf(walls: Wall[], front: Wall[], axis: 'x' | 'y') {
  const out: number[] = [];
  for (const f of front) {
    const s = span(f, axis);
    out.push(s.lo, s.hi);
    for (const w of walls) {
      if (orientation(w) === axis || orientation(w) === null) continue;
      const ws = span(w, axis === 'x' ? 'y' : 'x');
      // w runs across the façade: one of its ends is on the façade wall
      const meets = [ws.lo, ws.hi].some(e => Math.abs(e - s.at) <= f.thickness / 2 + w.thickness / 2 + 1);
      if (meets && ws.at >= s.lo - SAME && ws.at <= s.hi + SAME) out.push(ws.at);
    }
  }
  return marks(out);
}

/** Edges of the doors and windows in façade walls, along the side's axis */
function openingEdges(front: Wall[], axis: 'x' | 'y') {
  const i = axis === 'x' ? 0 : 1;
  return front.flatMap(w => {
    const d = wallDir(w)[i];
    return w.openings.flatMap(o => [w.start[i] + d * (o.at - o.width / 2), w.start[i] + d * (o.at + o.width / 2)]);
  });
}

/** Whether most of a chain's values fit their segments at this text size (a value is about 2.5 sizes wide) */
const readable = (m: number[], size: number) => m.slice(1).filter((t, i) => t - m[i] < size * 2.5).length <= (m.length - 1) * 0.3;

/**
 * The dimension chains around a level, outside its drawing's bounds, sized by `scale` (the first chain sits one and a half steps
 * out). A detail or axis chain too crowded to read at that size is left out, as a drawing at a smaller scale leaves out detail.
 */
export function exteriorDimensions(p: Project, level: string, bounds: [number, number, number, number], scale: { size: number; step: number }): DimChain[] {
  const { size, step } = scale;
  const onLevel = p.walls.filter(w => w.level === level && orientation(w));
  const storey = onLevel.filter(w => STOREY.has(w.kind)),
    enclosure = onLevel.filter(w => ENCLOSURE.has(w.kind));
  const out: DimChain[] = [];
  for (const side of SIDES) {
    const axis = side === 'top' || side === 'bottom' ? 'x' : 'y';
    const front = facade(storey, side);
    const chains: number[][] = [];
    if (front.length) {
      const axes = axesOf(storey, front, axis);
      const detail = marks([...axes, ...openingEdges(front, axis)]);
      if (detail.length > axes.length && readable(detail, size)) chains.push(detail);
      if (readable(axes, size)) chains.push(axes);
      const all = extent(storey, axis)!;
      chains.push(all);
      // The site or terrace: building and enclosure together, when the enclosure reaches beyond the building
      const fence = extent(enclosure, axis);
      if (fence && (fence[0] < all[0] - SAME || fence[1] > all[1] + SAME)) chains.push([Math.min(fence[0], all[0]), Math.max(fence[1], all[1])]);
    } else {
      const fence = extent(enclosure, axis);
      if (fence) chains.push(fence);
    }
    // The line runs across the axis, outside the bounds on this side
    const edge = { top: bounds[1], bottom: bounds[3], left: bounds[0], right: bounds[2] }[side];
    const n = OUT[side];
    chains.forEach((m, k) => {
      const at = edge + (n[0] + n[1]) * step * (1.5 + k);
      const origin: Point = axis === 'x' ? [0, at] : [at, 0];
      out.push({ origin, dir: axis === 'x' ? [1, 0] : [0, 1], normal: n, marks: m, ext: step * 0.6 });
    });
  }
  return out;
}

/** How far the exterior chains reach beyond the drawing's bounds, at most, for framing (in steps, values included) */
export const EXTERIOR_REACH = 5.5;

/** Distance to the nearest wall face of the level in one direction from a box, within 10 m; null when none */
function nearestFace(walls: Wall[], box: [number, number, number, number], dir: Point) {
  const [x0, y0, x1, y1] = box;
  let best: number | null = null;
  for (const w of walls) {
    const o = orientation(w);
    // A wall facing this direction: across it, and overlapping the box sideways
    if ((dir[0] !== 0 && o !== 'y') || (dir[1] !== 0 && o !== 'x')) continue;
    const s = span(w, o!);
    const [lo, hi] = dir[0] !== 0 ? [y0, y1] : [x0, x1];
    if (s.hi < lo || s.lo > hi) continue;
    const face = s.at - (dir[0] + dir[1]) * (w.thickness / 2);
    const from = dir[0] > 0 ? x1 : dir[0] < 0 ? x0 : dir[1] > 0 ? y1 : y0;
    const d = (face - from) * (dir[0] + dir[1]);
    if (d >= -1 && d < 10000 && (best === null || d < best)) best = Math.max(0, d);
  }
  return best;
}

/** Temporary dimensions for the selection: a wall's length, an opening's place in its wall, furniture's distance to the walls */
export function selectionDimensions(p: Project, ids: string[], step: number): DimChain[] {
  const out: DimChain[] = [];
  for (const id of ids) {
    const wall = p.walls.find(w => w.id === id);
    const host = p.walls.find(w => w.openings.some(o => o.id === id));
    if (wall || host) {
      const w = (wall ?? host)!;
      const L = wallLength(w);
      const o = host?.openings.find(x => x.id === id);
      const off = w.thickness / 2 + step * 0.6;
      // On the wall's outer side: away from the room it bounds (either side for a wall between rooms)
      const indoor = p.spaces.filter(s => s.level === w.level && s.kind === 'indoor');
      const right = wallNormal(w);
      const mid: Point = [(w.start[0] + w.end[0]) / 2, (w.start[1] + w.end[1]) / 2];
      const inside = (n: Point) => indoor.some(s => s.shape.some(poly => pointInPolygon([mid[0] + n[0] * off, mid[1] + n[1] * off], poly)));
      const n: Point = inside(right) && !inside([-right[0], -right[1]]) ? [-right[0], -right[1]] : right;
      out.push({
        origin: [w.start[0] + n[0] * off, w.start[1] + n[1] * off],
        dir: wallDir(w),
        normal: n,
        marks: o ? marks([0, o.at - o.width / 2, o.at + o.width / 2, L]) : [0, L],
        ext: step * 0.8,
      });
      continue;
    }
    const f = p.furniture.find(x => x.id === id);
    if (f) out.push(...furnitureDimensions(p, f));
  }
  return out;
}

function furnitureDimensions(p: Project, f: Furniture): DimChain[] {
  const walls = p.walls.filter(w => w.level === f.level && STOREY.has(w.kind) && orientation(w));
  const xs = furnitureFootprint(f).outer.map(q => q[0]),
    ys = furnitureFootprint(f).outer.map(q => q[1]);
  const box: [number, number, number, number] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const cx = (box[0] + box[2]) / 2,
    cy = (box[1] + box[3]) / 2;
  const out: DimChain[] = [];
  // The nearer wall across x, then across y
  for (const pair of [
    [
      [1, 0],
      [-1, 0],
    ],
    [
      [0, 1],
      [0, -1],
    ],
  ] as Point[][]) {
    const found = pair.map(d => ({ d, dist: nearestFace(walls, box, d) })).filter(x => x.dist !== null) as { d: Point; dist: number }[];
    // Against a wall on this axis already: nothing to measure across it
    if (!found.length || found.some(x => x.dist <= SAME)) continue;
    const { d, dist } = found.reduce((a, b) => (b.dist < a.dist ? b : a));
    const from: Point = d[0] > 0 ? [box[2], cy] : d[0] < 0 ? [box[0], cy] : d[1] > 0 ? [cx, box[3]] : [cx, box[1]];
    // Drawn from the piece towards the wall, values on the side the line reads from
    const dir: Point = d[0] + d[1] > 0 ? d : [-d[0], -d[1]];
    const origin: Point = d[0] + d[1] > 0 ? from : [from[0] + d[0] * dist, from[1] + d[1] * dist];
    out.push({ origin, dir, normal: dir[0] !== 0 ? [0, -1] : [-1, 0], marks: [0, dist], ext: 0 });
  }
  return out;
}
