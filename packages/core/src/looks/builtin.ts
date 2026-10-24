/**
 * The built-in look libraries: files in libraries/ at the repository root, loaded like any other library file. One of them is
 * configured as the default library: what an object without a look of its own is drawn with, and where materials, groups and
 * furniture types are looked up when a library doesn't have them. Nothing else about it is special.
 */
import chineseFile from '../../../../libraries/chinese.looklib.json' with { type: 'json' };
import defaultFile from '../../../../libraries/default.looklib.json' with { type: 'json' };
import { libraryTypes, lookRecipeOf, parseLibrary, type LibraryLook, type LookLibrary, type LookType } from './library.js';
import type { Material, Names } from './material.js';
import type { Recipe } from './script.js';

/** The default library's id (configuration, not a property of the file) */
export const DEFAULT_LIBRARY_ID = 'builtin-default';

export const DEFAULT_LIBRARY: LookLibrary = parseLibrary(defaultFile);

/** Every library shipped with the app, the default one first */
export const BUILTIN_LIBRARIES: LookLibrary[] = [DEFAULT_LIBRARY, parseLibrary(chineseFile, DEFAULT_LIBRARY)];

export const builtinLibrary = (id: string) => BUILTIN_LIBRARIES.find(l => l.id === id);

/** The default library's materials: what any look, wall or floor can use */
export const DEFAULT_MATERIALS: Record<string, Material> = DEFAULT_LIBRARY.materials ?? {};

/** Furniture types the default library brings: the catalogue a new project starts from */
export const DEFAULT_TYPES: Record<string, LookType> = libraryTypes(DEFAULT_LIBRARY);

/** A library's looks as recipes (one recipe per look, shared by its targets), carrying the library's own materials */
const recipes = new WeakMap<LibraryLook, Recipe>();
export function libraryRecipe(lib: LookLibrary, look: LibraryLook): Recipe {
  let r = recipes.get(look);
  if (!r) recipes.set(look, (r = lookRecipeOf(look, lib.id === DEFAULT_LIBRARY_ID ? undefined : lib.materials)));
  return r;
}

/**
 * The group a look of a library is shown in: its new type's group, its own group, or the group of the furniture type it draws
 * in the default library
 */
export function lookGroup(look: LibraryLook): string | undefined {
  if (look.newType) return look.newType.group;
  if (look.group) return look.group;
  const type = look.for.find(t => t.startsWith('furniture:'))?.slice('furniture:'.length);
  return type ? DEFAULT_TYPES[type]?.group : undefined;
}

/** A group's name: from the library that declares it, else from the default library */
export const groupNames = (lib: Pick<LookLibrary, 'groups'>, group: string) => lib.groups?.[group]?.name ?? DEFAULT_LIBRARY.groups?.[group]?.name;

/** A material by id: the recipe's own (its library's), then the design's, then the default library's */
export const materialOf = (id: string, recipe?: Pick<Recipe, 'materials'> | null, design?: Record<string, Material>): Material | undefined =>
  recipe?.materials?.[id] ?? design?.[id] ?? DEFAULT_MATERIALS[id];

/** A wall's finish when it has none of its own: white paint */
export const DEFAULT_FINISH = 'paint';

/** The size something is usually built at when nothing gives one: a typical door, window, railing or element */
export function typicalSize(target: string): { w: number; d: number; h: number } {
  const [kind, type] = target.split(':');
  if (kind === 'furniture') return DEFAULT_TYPES[type]?.size ?? { w: 1000, d: 600, h: 800 };
  if (kind === 'opening') return type === 'door' || type === 'gate' || type === 'opening' ? { w: 900, d: 240, h: 2100 } : { w: 1200, d: 240, h: 1500 };
  if (kind === 'wall') return { w: 3000, d: 60, h: 1100 };
  return { w: 2000, d: 2000, h: 3000 };
}

/** The size a library look is shown at: the type it brings, else its first target's usual size */
export const lookSizeOf = (look: Pick<LibraryLook, 'for' | 'newType'>) => look.newType?.size ?? typicalSize(look.for[0]);

/**
 * A library's looks by group, in display order: the library's own groups in the order it declares them, then the default
 * library's; groups it has no looks in are left out, and looks without a group come last (group null)
 */
export function groupedLooks(lib: LookLibrary): { group: string | null; names?: Names; looks: [string, LibraryLook][] }[] {
  const order = [...Object.keys(lib.groups ?? {}), ...Object.keys(DEFAULT_LIBRARY.groups ?? {})];
  const by = new Map<string | null, [string, LibraryLook][]>();
  for (const entry of Object.entries(lib.looks)) {
    const g = lookGroup(entry[1]) ?? null;
    by.set(g && order.includes(g) ? g : null, [...(by.get(g && order.includes(g) ? g : null) ?? []), entry]);
  }
  return [...new Set([...order, null])].filter(g => by.has(g)).map(g => ({ group: g, ...(g ? { names: groupNames(lib, g) } : {}), looks: by.get(g)! }));
}
