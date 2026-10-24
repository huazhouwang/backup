/**
 * Look libraries as files, like font files: a library is one JSON document (`*.looklib.json`, format in
 * libraries/looklib.schema.json at the repository root) holding groups, materials and looks. The built-in libraries are such
 * files in the repository; user libraries are exported and imported as such files; the looks a design embeds keep the same
 * structure. Standards are reused where one exists: glTF 2.0 materials, JSON Schema parameters (script.ts), semver versions
 * and SPDX licences. Only the JSONata script and the multilingual names are our own.
 */
import { z } from 'zod';
import { paramDeclSchema, type ParamDecl, type Recipe } from './script.js';
import { materialSchema, namesSchema, type Material, type Names } from './material.js';

/** A furniture type a look brings: its name, group and default size */
export interface LookType {
  name: Names;
  /** A group of its library or the default library's; shown under "other" without one */
  group?: string;
  size: { w: number; d: number; h: number };
}

/** One way to draw something: a recipe (params, seed, script) and what it is for */
export interface LibraryLook {
  name: Names;
  /** Targets: 'furniture:<type>', 'opening:<kind>' (or 'opening:glass-block'), 'element:<type>', 'wall:railing' */
  for: string[];
  /** The group it is shown in; by default its type's group */
  group?: string;
  /** Only for a furniture type the catalogue doesn't have */
  newType?: LookType;
  /** semver */
  version: string;
  params?: Record<string, ParamDecl>;
  seed?: number;
  script: string;
}

export interface LookLibrary {
  $schema?: string;
  format: 'plinth-looks';
  formatVersion: 1;
  id: string;
  name: Names;
  description?: Names;
  version: string;
  author?: string;
  /** SPDX identifier */
  license?: string;
  /** Groups looks are shown in, in display order */
  groups?: Record<string, { name: Names }>;
  materials?: Record<string, Material>;
  looks: Record<string, LibraryLook>;
}

export const LIBRARY_FORMAT = 'plinth-looks';
export const LIBRARY_FORMAT_VERSION = 1;
export const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const id = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/)
  .max(64);
const key = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/)
  .max(64);
export const TARGET = /^(furniture|opening|element|wall):[A-Za-z0-9_-]+$/;
const size = z.object({ w: z.number().positive(), d: z.number().positive(), h: z.number().positive() });

export const libraryLookSchema: z.ZodType<LibraryLook> = z.object({
  name: namesSchema,
  for: z.array(z.string().regex(TARGET)).min(1),
  group: key.optional(),
  newType: z.object({ name: namesSchema, group: key.optional(), size }).optional(),
  version: z.string().regex(SEMVER),
  params: z.record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), paramDeclSchema).optional(),
  seed: z.number().int().optional(),
  script: z.string().min(1).max(30000),
});

export const librarySchema: z.ZodType<LookLibrary> = z.object({
  $schema: z.string().optional(),
  format: z.literal(LIBRARY_FORMAT),
  formatVersion: z.literal(LIBRARY_FORMAT_VERSION),
  id,
  name: namesSchema,
  description: namesSchema.optional(),
  version: z.string().regex(SEMVER),
  author: z.string().max(200).optional(),
  license: z.string().max(100).optional(),
  groups: z.record(key, z.object({ name: namesSchema })).optional(),
  materials: z.record(key, materialSchema).optional(),
  looks: z.record(key, libraryLookSchema),
});

export class LibraryError extends Error {}

/** A library file, checked (the format, and that the groups and types its looks name exist); throws a LibraryError */
export function parseLibrary(input: unknown, fallback?: LookLibrary): LookLibrary {
  const parsed = librarySchema.safeParse(input);
  if (!parsed.success)
    throw new LibraryError(
      parsed.error.issues
        .slice(0, 8)
        .map(i => `${i.path.join('.') || 'library'}: ${i.message}`)
        .join('; '),
    );
  const lib = parsed.data;
  for (const [k, look] of Object.entries(lib.looks)) {
    const group = look.newType?.group ?? look.group;
    if (group && !lib.groups?.[group] && !fallback?.groups?.[group]) throw new LibraryError(`looks.${k}: unknown group ${group}`);
    if (look.newType && look.for.filter(t => t.startsWith('furniture:')).length !== 1)
      throw new LibraryError(`looks.${k}: a look with a newType draws exactly one furniture type`);
  }
  return lib;
}

/** Compare two semver versions (-1, 0, 1); numbers count as major versions */
export function compareVersions(a: string | number, b: string | number): number {
  const parts = (v: string | number) => String(v).split('-')[0].split('.').map(Number);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0) ? -1 : 1;
  return 0;
}

/** The furniture type a look brings, keyed by type */
export function libraryTypes(lib: LookLibrary): Record<string, LookType> {
  return Object.fromEntries(
    Object.values(lib.looks).flatMap(l => {
      const t = l.newType && l.for.find(x => x.startsWith('furniture:'));
      return t ? [[t.slice('furniture:'.length), l.newType!] as const] : [];
    }),
  );
}

/** A look of a library as a recipe; looks outside the default library carry their library's materials */
export function lookRecipeOf(look: LibraryLook, materials?: Record<string, Material>): Recipe {
  return {
    ...(look.params ? { params: look.params } : {}),
    ...(look.seed !== undefined ? { seed: look.seed } : {}),
    script: look.script,
    ...(materials && Object.keys(materials).length ? { materials } : {}),
  };
}

/** The materials of `all` a recipe names: quoted in its script, or as a parameter's default or choice */
export function materialsUsed(r: Pick<Recipe, 'script' | 'params'>, all: Record<string, Material>): Record<string, Material> {
  const named = new Set<string>();
  for (const m of r.script.matchAll(/["']([A-Za-z][A-Za-z0-9_-]*)["']/g)) named.add(m[1]);
  for (const d of Object.values(r.params ?? {})) for (const v of [d.default, ...(d.enum ?? [])]) if (typeof v === 'string') named.add(v);
  return Object.fromEntries([...named].filter(k => all[k]).map(k => [k, all[k]]));
}
