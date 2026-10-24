/**
 * What each part of a house is drawn in, shared by the editor's 3D view and the house stills: a wall's finish, a floor's material,
 * the materials an element's look gives each kind of its solids, and the theme colors used when a part has no material.
 */
import { DEFAULT_FINISH, elementTarget, lookRecipe, materialOf, type Built, type Element, type Project, type Solid, type Wall } from '@plinth/core';
import { materialStyle } from '@/lib/materials';
import { ELEMENT_SIZE } from './units';

/** A wall's faces in its finish (white paint unless it has one) */
export const wallFinish = (project: Project, w: Wall) => materialStyle(materialOf(w.finish ?? DEFAULT_FINISH, null, project.library.materials));

/** A floor's material (its pattern or colour), if it has one */
export const floorMaterial = (project: Project, floor: string) => materialOf(floor, null, project.library.materials);

/** An element's look and what to build it at to read the materials of its own solids */
export const elementLook = (project: Project, e: Element) => ({
  recipe: lookRecipe(project, elementTarget(e), e.look),
  size: ELEMENT_SIZE,
  params: e.lookParams,
});

/** The material an element's built look gives one kind of its solids (stair steps, a pond's water…), if it names one */
export function solidMaterial(project: Project, built: Built | undefined, s: Solid, e: Element) {
  const own = built?.parts.find(p => p.kind === 'base');
  const mat = own?.kind === 'base' ? own.mats[s.kind] : undefined;
  return mat ? materialStyle(materialOf(mat, elementLook(project, e).recipe, project.library.materials)) : undefined;
}

/** Whether an element's built look adds parts beyond its own solids */
export const hasExtras = (built: Built | undefined) => !!built?.parts.some(p => p.kind !== 'base');

/** The theme color (canvas variable) a solid without a material is drawn in */
export const solidFallbackColor = (s: Solid) => (s.kind === 'water' ? '--muted' : s.kind === 'grate' ? '--muted-foreground' : '--card');
