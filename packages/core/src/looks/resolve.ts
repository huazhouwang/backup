/** Which recipe draws an object, and its plan symbol in plan coordinates */
import type { PlanSymbol } from './recipe.js';
import { builtPlan, type Recipe } from './script.js';
import { typicalSize } from './builtin.js';
import { getBuild } from './cache.js';
import type { Element, Furniture, Opening, Point, Project, Wall } from '../model/schema.js';
import { DEFAULT_LOOKS, type LookTarget } from './defaults.js';

export const furnitureTarget = (f: Pick<Furniture, 'type'>): LookTarget => `furniture:${f.type}`;
export const openingTarget = (o: Pick<Opening, 'kind' | 'glazing'>): LookTarget => (o.glazing === 'glass-block' ? 'opening:glass-block' : `opening:${o.kind}`);
export const elementTarget = (e: Pick<Element, 'type'>): LookTarget => `element:${e.type}`;
export const wallTarget = (w: Pick<Wall, 'kind'>): LookTarget => `wall:${w.kind}`;

/**
 * The recipe that draws an object, like a font resolving a character: the object's own look, else the look the design uses for
 * its target, else the default set; null when none draws it (a furniture type without a look is drawn as a block). A look that
 * doesn't fit the target is skipped.
 */
export function lookRecipe(p: Project, target: LookTarget, own?: string): Recipe | null {
  const looks = p.library.looks ?? {};
  for (const id of [own, p.library.use?.[target]]) {
    const look = id ? looks[id] : undefined;
    if (look && look.for.includes(target)) return look.recipe;
  }
  return DEFAULT_LOOKS[target] ?? null;
}

/** The look ID an object is drawn with (its own, the design's for its target), or null for the default */
export function lookOf(p: Project, target: LookTarget, own?: string): string | null {
  const looks = p.library.looks ?? {};
  for (const id of [own, p.library.use?.[target]]) if (id && looks[id]?.for.includes(target)) return id;
  return null;
}

/** The looks of this design that fit a target */
export const looksFor = (p: Project, target: LookTarget) => Object.entries(p.library.looks ?? {}).filter(([, l]) => l.for.includes(target));

/** A size to check a recipe at for a target: the design's furniture type's size, or a typical opening, railing or element */
export function targetSize(p: Project, target: string): { w: number; d: number; h: number } {
  const [kind, type] = target.split(':');
  return (kind === 'furniture' && p.library.furniture[type]?.size) || typicalSize(target);
}

/** The last plan symbol drawn for each piece, shown while a changed one builds */
const lastPlan = new Map<string, PlanSymbol>();

/**
 * A piece of furniture's plan symbol (outlines seen from above, lowest first), in plan coordinates; null if it has no look or
 * it fails to build. While its build is under way (looks/cache.ts) the last symbol drawn for it is used.
 */
export function furniturePlan(p: Project, f: Furniture): PlanSymbol | null {
  const recipe = lookRecipe(p, furnitureTarget(f), f.look);
  if (!recipe) return null;
  const built = getBuild(recipe, f.size, f.lookParams);
  const sym = built ? builtPlan(built) : lastPlan.get(f.id);
  if (!sym) return null;
  if (built) lastPlan.set(f.id, sym);
  const r = (f.rotation * Math.PI) / 180,
    c = Math.cos(r),
    s = Math.sin(r);
  const tf = ([x, z]: Point): Point => [f.position[0] + x * c - z * s, f.position[1] + x * s + z * c];
  return { items: sym.items.map(it => ({ ...it, ring: it.ring.map(tf) })), lines: sym.lines.map(l => l.map(tf)) };
}
