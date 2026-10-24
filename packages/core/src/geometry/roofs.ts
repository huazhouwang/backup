/**
 * Roofs over rooms with nothing above them, as BIM tools put a roof on a footprint: a room whose ceiling no floor above provides
 * (a stair penthouse on the roof, a ground-floor wing under no upper floor) gets a flat roof slab at the top of its walls. Derived,
 * not stored, so it follows the room and its walls.
 */
import pc from 'polygon-clipping';
import { levelAbove } from '../model/levels.js';
import type { Id, Polygon, Project, Space, Wall } from '../model/schema.js';
import { area, fromPc, toPc, wallBody } from './geometry.js';
import { wallHeight } from './mesh.js';
import { overlapArea } from './topology.js';

export interface Roof {
  /** The room it covers */
  space: Id;
  level: Id;
  /** The part of the room no floor above covers */
  shape: Polygon[];
  /** Its top, in millimetres above the room's level: the top of the room's walls */
  top: number;
}

/** Rooms that need a roof: indoor ones (terraces, eaves and courtyards stay open) */
const ROOFED = new Set<Space['kind']>(['indoor']);
const STOREY_WALLS = new Set<Wall['kind']>(['bearing', 'partition']);
/** Uncovered bits smaller than this (mm²) are slivers along the walls, not a missing ceiling */
const MIN_AREA = 0.5e6;

export function roofs(p: Project): Roof[] {
  const out: Roof[] = [];
  for (const s of p.spaces) {
    if (!ROOFED.has(s.kind)) continue;
    // Whatever the level above has over it: a floor, or a stair well or void through which the room continues upwards
    const above = levelAbove(p, s.level);
    const floors = above ? p.spaces.filter(x => x.level === above.id).flatMap(x => x.shape) : [];
    const shape = floors.length ? fromPc(pc.difference(s.shape.map(toPc), ...floors.map(f => [toPc(f)]))) : s.shape;
    if (area(shape) < MIN_AREA) continue;
    // The walls around it (rooms run to the wall centrelines, so their bodies overlap the room)
    const walls = p.walls.filter(w => w.level === s.level && STOREY_WALLS.has(w.kind) && overlapArea([wallBody(w)], s.shape) > 0);
    if (!walls.length) continue;
    out.push({ space: s.id, level: s.level, shape, top: Math.max(...walls.map(w => wallHeight(p, w))) });
  }
  return out;
}
