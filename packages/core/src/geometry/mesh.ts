/**
 * Generates 3D blocks from the data: each wall is cut at its openings into solid segments (sills below openings, lintels above, piers between them),
 * each a box aligned with the wall. The renderer only draws boxes, and glTF export uses the same result.
 */
import { wallDir, wallLength } from './geometry.js';
import type { Id, Project, Wall } from '../model/schema.js';

/** Thickness of a glass-block infill and of a window's pane (mm) */
const GLASS_BLOCK = 80;
const PANE = 30;

export interface Box {
  /** Owning object */
  id: Id;
  level: Id;
  kind: 'wall' | 'sill' | 'lintel' | 'railing' | 'parapet' | 'fence' | 'glass' | 'glass-block';
  /** Bottom-face centre (plan coordinates, mm) */
  center: [number, number];
  /** Height of the bottom face above this level's floor */
  z: number;
  /** Length along the wall, wall thickness, height */
  length: number;
  thickness: number;
  height: number;
  /** Angle between the wall direction and the x axis (radians, y points south) */
  angle: number;
}

export function wallHeight(p: Project, w: Wall) {
  if (w.height) return w.height;
  const lv = p.levels.find(l => l.id === w.level);
  if (w.kind === 'railing') return 1100;
  if (w.kind === 'parapet') return 1100;
  if (w.kind === 'fence') return 2000;
  return lv && lv.height > 0 ? lv.height : 3000;
}

export function wallBoxes(p: Project, w: Wall): Box[] {
  const L = wallLength(w),
    d = wallDir(w),
    H = wallHeight(p, w);
  const angle = Math.atan2(d[1], d[0]);
  const kind: Box['kind'] = w.kind === 'railing' ? 'railing' : w.kind === 'parapet' ? 'parapet' : w.kind === 'fence' ? 'fence' : 'wall';
  const ext = w.kind === 'bearing' || w.kind === 'partition' ? w.thickness / 2 : 0;
  const box = (a: number, b: number, z: number, h: number, k: Box['kind']): Box => {
    const mid = (a + b) / 2;
    return {
      id: w.id,
      level: w.level,
      kind: k,
      angle,
      thickness: k === 'glass-block' ? Math.min(GLASS_BLOCK, w.thickness) : k === 'glass' ? Math.min(PANE, w.thickness) : w.thickness,
      center: [w.start[0] + d[0] * mid, w.start[1] + d[1] * mid],
      z,
      length: b - a,
      height: h,
    };
  };
  const out: Box[] = [];
  const ops = [...w.openings].sort((a, b) => a.at - b.at);
  let t = -ext;
  for (const o of ops) {
    const a = Math.max(-ext, o.at - o.width / 2),
      b = Math.min(L + ext, o.at + o.width / 2);
    if (a > t) out.push(box(t, a, 0, H, kind));
    const top = Math.min(H, o.sill + o.height);
    if (o.sill > 0) out.push(box(a, b, 0, o.sill, kind === 'wall' ? 'sill' : kind));
    if (top < H) out.push(box(a, b, top, H - top, kind === 'wall' ? 'lintel' : kind));
    // Windows and sliding doors are glazed (a pane, or a glass-block infill); doors, gates and plain openings stay open
    if (o.glazing === 'glass-block') out.push(box(a, b, o.sill, top - o.sill, 'glass-block'));
    else if (o.kind === 'window' || o.kind === 'sliding-door') out.push(box(a, b, o.sill, top - o.sill, 'glass'));
    t = Math.max(t, b);
  }
  if (t < L + ext) out.push(box(t, L + ext, 0, H, kind));
  return out.filter(b => b.length > 1 && b.height > 1);
}

export const projectBoxes = (p: Project) => p.walls.flatMap(w => wallBoxes(p, w));

/** Where an opening sits in 3D: the centre of its sill in plan, its height above the floor, size, and the wall's direction */
export interface OpeningFrame {
  id: Id;
  wall: Id;
  level: Id;
  center: [number, number];
  z: number;
  width: number;
  height: number;
  /** The wall's thickness */
  thickness: number;
  /** Angle between the wall direction and the x axis (radians, y points south) */
  angle: number;
}

/** Every opening's frame (clipped to its wall, like the boxes above) */
export function openingFrames(p: Project): (OpeningFrame & { opening: Wall['openings'][number] })[] {
  return p.walls.flatMap(w => {
    const L = wallLength(w),
      d = wallDir(w),
      H = wallHeight(p, w);
    const ext = w.kind === 'bearing' || w.kind === 'partition' ? w.thickness / 2 : 0;
    return w.openings
      .map(o => {
        const a = Math.max(-ext, o.at - o.width / 2),
          b = Math.min(L + ext, o.at + o.width / 2),
          mid = (a + b) / 2;
        return {
          id: o.id,
          wall: w.id,
          level: w.level,
          opening: o,
          center: [w.start[0] + d[0] * mid, w.start[1] + d[1] * mid] as [number, number],
          z: o.sill,
          width: b - a,
          height: Math.min(H, o.sill + o.height) - o.sill,
          thickness: w.thickness,
          angle: Math.atan2(d[1], d[0]),
        };
      })
      .filter(f => f.width > 1 && f.height > 1);
  });
}
