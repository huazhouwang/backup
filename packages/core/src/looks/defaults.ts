/**
 * The default looks: a recipe for every target the default library draws (furniture types, kinds of opening, element types,
 * railings). It is never written to a project; designs that don't choose other looks follow it as the library improves.
 */
import type { Recipe } from './script.js';
import { DEFAULT_LIBRARY, libraryRecipe } from './builtin.js';

/** What a look is for: a furniture type, a kind of opening (glass-block windows count as their own kind), an element type or a railing */
export type LookTarget = `furniture:${string}` | `opening:${string}` | `element:${string}` | `wall:${string}`;

export const DEFAULT_LOOKS: Record<LookTarget, Recipe> = Object.fromEntries(
  Object.values(DEFAULT_LIBRARY.looks).flatMap(look => look.for.map(t => [t, libraryRecipe(DEFAULT_LIBRARY, look)] as const)),
);
