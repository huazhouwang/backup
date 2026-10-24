/**
 * The furniture catalog a new project starts from: the furniture types of the default library (looks/builtin.ts). Every type
 * is named in each project language; a project stores only the names in its own language (a plain `name` string). Materials
 * aren't copied into projects: walls, floors and looks use the default library's, and a design keeps only its own.
 */
import { nameIn } from '../looks/material.js';
import type { LookType } from '../looks/library.js';
import { DEFAULT_LIBRARY, DEFAULT_TYPES, groupNames } from '../looks/builtin.js';
import type { Library, ProjectLanguage } from './schema.js';

/** Furniture types, from the default library's looks (`newType`): name, group and default size */
export const FURNITURE_TYPES: Record<string, LookType> = DEFAULT_TYPES;

/** Furniture catalog for a new project, named in the project's language */
export function furnitureCatalog(lang: ProjectLanguage = 'zh'): Library['furniture'] {
  return Object.fromEntries(
    Object.entries(FURNITURE_TYPES).map(([k, v]) => [
      k,
      { name: nameIn(v.name, lang), group: v.group ? nameIn(groupNames(DEFAULT_LIBRARY, v.group), lang) : undefined, size: { ...v.size } },
    ]),
  );
}
