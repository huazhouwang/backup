/**
 * The model axes (see Axes in schema.ts): x east, y south and z up, square to each other, crossing at an origin on the ground. By
 * default the origin is the house's top-left corner on the plan (the north-west corner of the ground floor's walls); once
 * people move it, the project keeps it.
 */
import type { Point, Project } from '../model/schema.js';
import { wallBody } from './geometry.js';

/** The house's top-left corner on the plan: the least x and y of the ground floor's storey walls, or 0, 0 without any */
export function houseCorner(p: Project): Point {
  const ground = Math.min(...p.levels.map(l => l.elevation));
  const level = p.levels.find(l => l.elevation === ground)?.id;
  const ring = p.walls.filter(w => w.level === level && (w.kind === 'bearing' || w.kind === 'partition')).flatMap(w => wallBody(w).outer);
  if (!ring.length) return [0, 0];
  return [Math.round(Math.min(...ring.map(q => q[0]))), Math.round(Math.min(...ring.map(q => q[1])))];
}

/** Where the axes cross: where people put the origin, else the house's top-left corner */
export const axesOrigin = (p: Project): Point => p.axes?.origin ?? houseCorner(p);
