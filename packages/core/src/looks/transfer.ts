/**
 * Looks moving between libraries and designs: a design copies a library look with the materials it uses and the furniture type
 * it brings (look_import), and saves one of its own looks to a library in the library's structure.
 */
import { lookRecipeOf, materialsUsed, type LibraryLook, type LookLibrary } from './library.js';
import { nameIn, type Material, type Names } from './material.js';
import type { Look, Project, ProjectLanguage } from '../model/schema.js';
import { DEFAULT_LIBRARY, DEFAULT_LIBRARY_ID, DEFAULT_TYPES, groupNames } from './builtin.js';

/** A name in one language, as names in several: in Chinese if it has Chinese characters, else in English */
export const namesOf = (s: string): Names => (/[一-鿿]/.test(s) ? { zh: s } : { en: s });

/** A library look as a design copies it (look_import's input): named in the design's language, with its materials and type */
export function designLookOf(lib: LookLibrary, id: string, lang: ProjectLanguage) {
  const look = lib.looks[id];
  const recipe = lookRecipeOf(look, lib.id === DEFAULT_LIBRARY_ID ? undefined : materialsUsed(look, lib.materials ?? {}));
  const type = look.newType && look.for.find(t => t.startsWith('furniture:'))?.slice('furniture:'.length);
  const group = look.newType?.group && groupNames(lib, look.newType.group);
  return {
    name: nameIn(look.name, lang),
    for: [...look.for],
    recipe,
    ...(type
      ? { types: { [type]: { name: nameIn(look.newType!.name, lang), ...(group ? { group: nameIn(group, lang) } : {}), size: { ...look.newType!.size } } } }
      : {}),
    source: { library: lib.id, look: id, version: look.version },
  };
}

/**
 * A design look as a library keeps it (without a version, which the library sets): its recipe, the furniture types it draws that
 * the default library doesn't have, and the materials it brings
 */
export function libraryLookOf(p: Project, look: Look): Omit<LibraryLook, 'version'> & { materials?: Record<string, Material> } {
  const type = look.for.map(t => t.split(':')).find(([k, t]) => k === 'furniture' && !DEFAULT_TYPES[t] && p.library.furniture[t])?.[1];
  const def = type ? p.library.furniture[type] : undefined;
  const group = def?.group && Object.entries(DEFAULT_LIBRARY.groups ?? {}).find(([, g]) => nameIn(g.name, p.language) === def.group)?.[0];
  const { params, seed, script, materials } = look.recipe;
  return {
    name: { [p.language]: look.name },
    for: [...look.for],
    ...(def ? { newType: { name: { [p.language]: def.name }, ...(group ? { group } : {}), size: { ...def.size } } } : {}),
    ...(params ? { params } : {}),
    ...(seed !== undefined ? { seed } : {}),
    script,
    ...(materials ? { materials } : {}),
  };
}
