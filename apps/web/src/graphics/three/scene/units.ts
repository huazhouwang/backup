/** Units and sizes shared by everything drawn in 3D. Data is in millimetres, scenes in metres. */
import { SLAB_THICKNESS, type Space } from '@plinth/core';

/** Millimetres to metres */
export const M = 0.001;
/** Size an element's look is built at to read its materials and whether it adds parts (both independent of size) */
export const ELEMENT_SIZE = { w: 2000, d: 2000, h: 3000 };

/** Whether a space has a floor slab: voids and openings in the slab have none */
export const hasSlab = (s: Space) => s.kind !== 'void' && !s.slabOpening;

/**
 * How far below a level its walls and floors reach down to the site's ground, in millimetres: the ground floor (elevation 0)
 * stands on the ground, so when the ground is lower its walls and floors continue down to it instead of floating above it
 */
export const footing = (elevation: number, groundLevel: number) => (elevation === 0 && groundLevel < 0 ? -groundLevel : 0);

/**
 * A space's floor slab in millimetres: its top and thickness. Outdoor paving is thin, and on the ground floor it sits just above
 * the site's ground; an indoor ground floor reaches down to the ground.
 */
export function slabLevel(s: Space, elevation: number, groundLevel: number) {
  const outdoor = s.kind === 'outdoor';
  if (outdoor) return { y: elevation === 0 ? groundLevel + 20 : elevation, thickness: 20 };
  return { y: elevation, thickness: Math.max(SLAB_THICKNESS, footing(elevation, groundLevel)) };
}
