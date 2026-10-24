/** Looks as they are saved to a library: parsed from what the client sends, checked to build, saved with the materials they bring */
import {
  buildRecipe,
  checkRecipe,
  FURNITURE_TYPES,
  libraryLookSchema,
  lookRecipeOf,
  materialOf,
  materialSchema,
  namesOf,
  normalizeParams,
  normalizeRecipe,
  typicalSize,
  type Material,
} from '@plinth/core';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { m } from '@/lib/i18n';
import * as repo from './repo';
import type { LibraryLookInput } from '@/shared/looks';

/** A look as the client sends it: the library file's look without a version, with the materials it brings; a plain name is accepted */
export const zLibraryLook = z
  .object({ name: z.union([z.string().min(1).max(80), z.record(z.string(), z.string())]), materials: z.record(z.string(), materialSchema).optional() })
  .loose();

export function parseLook(input: z.output<typeof zLibraryLook>): LibraryLookInput {
  const { materials, ...rest } = input;
  const named = { ...rest, name: typeof rest.name === 'string' ? namesOf(rest.name) : rest.name, version: '1.0.0' };
  if ('recipe' in named) Object.assign(named, normalizeRecipe(named.recipe), { recipe: undefined });
  else if ('params' in named) named.params = normalizeParams(named.params, materials);
  const parsed = libraryLookSchema.safeParse(JSON.parse(JSON.stringify(named)));
  if (!parsed.success)
    throw new HTTPException(400, {
      message: parsed.error.issues
        .slice(0, 5)
        .map(i => `${i.path.join('.')}: ${i.message}`)
        .join('; '),
    });
  const { version: _v, ...look } = parsed.data;
  return { ...look, ...(materials ? { materials } : {}) };
}

/**
 * A library look must build for each target it is for, at that target's size, using only materials it can reach (its own, its
 * library's, the default library's)
 */
export async function checkLibraryLook(l: LibraryLookInput, libraryMaterials: Record<string, Material> = {}) {
  const recipe = { ...lookRecipeOf({ ...l, version: '1.0.0' }), materials: { ...libraryMaterials, ...l.materials } };
  for (const t of l.for) {
    const [kind, type] = t.split(':');
    if (kind === 'furniture' && !l.newType && !FURNITURE_TYPES[type]) throw new HTTPException(400, { message: m.server_err_library_type({ type }) });
    const size = l.newType?.size ?? typicalSize(t);
    const problems = await checkRecipe(recipe, size);
    if (problems.length) throw new HTTPException(400, { message: problems.join('; ') });
    const built = await buildRecipe(recipe, size);
    const missing = [...new Set(built.parts.flatMap(p => (p.kind === 'base' ? Object.values(p.mats) : [p.mat])))].filter(id => !materialOf(id, recipe));
    if (missing.length) throw new HTTPException(400, { message: `unknown material ${missing.join(', ')}` });
  }
}

/** Save a look to a library, adding the materials it brings to the library's */
export async function saveLook(libraryId: string, lookId: string, l: LibraryLookInput, userId: string) {
  const { materials, ...look } = l;
  if (materials) await repo.updateLibraryMeta(libraryId, meta => ({ ...meta, materials: { ...meta.materials, ...materials } }));
  return repo.putLibraryLook(libraryId, lookId, look, userId);
}
