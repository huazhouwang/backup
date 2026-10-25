/**
 * Where the floor slabs are. A space carries a slab unless it is a void or marked as a slab opening; an opening cuts the slabs
 * of the other spaces it overlaps on its level, as a shaft or stair opening cuts the floors it crosses in BIM tools.
 */
import { difference, pointInPolygon } from './geometry.js';
import type { Id, Point, Polygon, Project, Space } from '../model/schema.js';

export const isSlabOpening = (s: Space) => s.kind === 'void' || !!s.slabOpening;

/** A space's slab: its shape less the slab openings on its level (none for an opening itself) */
export function slabShape(p: Project, s: Space): Polygon[] {
  if (isSlabOpening(s)) return [];
  const holes = p.spaces.filter(o => o.level === s.level && o.id !== s.id && isSlabOpening(o)).flatMap(o => o.shape);
  return holes.length ? difference(s.shape, holes) : s.shape;
}

/** Whether a level has floor slab at a point (`outdoor` spaces count unless `indoorOnly`) */
export function slabAt(p: Project, level: Id, at: Point, indoorOnly = false): boolean {
  const inside = (s: Space) => s.level === level && s.shape.some(poly => pointInPolygon(at, poly));
  return p.spaces.some(s => inside(s) && !isSlabOpening(s) && !(indoorOnly && s.kind === 'outdoor')) && !p.spaces.some(s => inside(s) && isSlabOpening(s));
}
