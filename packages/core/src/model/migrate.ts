import { text } from '../i18n.js';
import { upgradeLegacyStairs } from '../legacy/stairs.js';
import { nameIn } from '../looks/material.js';
import { DEFAULT_MATERIALS, DEFAULT_TYPES } from '../looks/builtin.js';
import { normalizeRecipe } from '../looks/recipe-convert.js';
import { SCHEMA, SCHEMA_VERSION, type Project } from './schema.js';

/**
 * When the schema is upgraded, add a step here: MIGRATIONS[n] converts version n data to version n+1.
 * Old samples therefore always load, and changing the schema costs just one function.
 */
const MIGRATIONS: Record<number, (doc: any) => any> = {
  // v2 adds the project language; all data before it was written in Chinese
  1: doc => ({ ...doc, language: doc.language ?? 'zh' }),
  // v3: the legacy page's stair becomes proper U-shaped stairs, one per storey
  2: doc => upgradeLegacyStairs(doc),
  // v4 adds looks (library.looks, library.use, an object's own look); all optional, nothing to convert
  3: doc => doc,
  // v5: recipes are JSONata scripts; looks stored as part lists become scripts that build the same parts
  4: doc =>
    !doc.library?.looks
      ? doc
      : {
          ...doc,
          library: {
            ...doc.library,
            looks: Object.fromEntries(Object.entries(doc.library.looks).map(([id, l]: [string, any]) => [id, { ...l, recipe: normalizeRecipe(l.recipe) }])),
          },
        },
  // v6 adds look parameter values on furniture, openings and elements (lookParams); optional, nothing to convert
  5: doc => doc,
  // v7: look libraries as files (#93)
  6: doc => toV7(doc),
};

/** Furniture types merged in v7: the same design at another size or shape (the planting bed "bed" frees its key for the bed) */
const MERGED: Record<string, string> = { sofa3: 'sofa', sofa2: 'sofa', bed18: 'bed', bed15: 'bed', bed12: 'bed', shower5: 'shower', bed: 'planter' };
/** Floor materials renamed in v7: teak flooring was "wood", which furniture uses for its own wood */
const RENAMED_FLOORS: Record<string, string> = { wood: 'teak' };

/**
 * v7: merged furniture types (the size and a parameter carry the difference, so everything looks the same); materials come from
 * the default library, and library.materials keeps only the design's own; look parameters are JSON Schema declarations; a
 * copied look records its library version as semver
 */
function toV7(doc: any) {
  const lang = doc.language === 'en' ? 'en' : 'zh';
  const type = (t: string) => MERGED[t] ?? t;
  const target = (t: string) => (t.startsWith('furniture:') ? `furniture:${type(t.slice(10))}` : t);
  const lib = doc.library ?? {};
  const furniture: Record<string, any> = {};
  for (const [k, v] of Object.entries<any>(lib.furniture ?? {})) {
    const to = type(k);
    if (furniture[to]) continue;
    furniture[to] = to === k ? v : { ...v, name: nameIn(DEFAULT_TYPES[to]?.name, lang) || v.name, size: { ...(DEFAULT_TYPES[to]?.size ?? v.size) } };
  }
  const use: Record<string, string> = {};
  for (const [t, id] of Object.entries<string>(lib.use ?? {})) use[target(t)] ??= id;
  const materials: Record<string, any> = {};
  for (const [k, v] of Object.entries<any>(lib.materials ?? {})) {
    const id = RENAMED_FLOORS[k] ?? k;
    if (DEFAULT_MATERIALS[id] || materials[id]) continue;
    materials[id] = { name: { [lang]: v?.name ?? id }, pbrMetallicRoughness: { baseColorFactor: [0.8, 0.8, 0.8, 1], metallicFactor: 0, roughnessFactor: 0.9 } };
  }
  const looks =
    lib.looks &&
    Object.fromEntries(
      Object.entries<any>(lib.looks).map(([id, l]) => [
        id,
        {
          ...l,
          for: [...new Set<string>(l.for.map(target))],
          recipe: normalizeRecipe(l.recipe),
          ...(l.source ? { source: { ...l.source, version: typeof l.source.version === 'number' ? `${l.source.version}.0.0` : l.source.version } } : {}),
        },
      ]),
    );
  return {
    ...doc,
    furniture: (doc.furniture ?? []).map((f: any) => {
      const to = type(f.type);
      if (to === f.type) return f;
      // The diamond shower is the shower's diamond shape, unless the piece has a look of its own
      const params = f.type === 'shower5' && !f.look ? { ...f.lookParams, shape: 'diamond' } : f.lookParams;
      return { ...f, type: to, ...(params ? { lookParams: params } : {}) };
    }),
    spaces: (doc.spaces ?? []).map((s: any) => (RENAMED_FLOORS[s.floor] ? { ...s, floor: RENAMED_FLOORS[s.floor] } : s)),
    library: { ...lib, furniture, materials, ...(lib.use ? { use } : {}), ...(looks ? { looks } : {}) },
  };
}

export class SchemaError extends Error {}

export function migrate(doc: unknown): Project {
  const d = doc as any;
  if (!d || d.schema !== SCHEMA) throw new SchemaError(text('schema_not_plinth', 'Not a Plinth project file (schema should be {schema})', { schema: SCHEMA }));
  if (typeof d.version !== 'number') throw new SchemaError(text('schema_no_version', 'Missing version'));
  if (d.version > SCHEMA_VERSION)
    throw new SchemaError(
      text('schema_too_new', 'File version {version} is newer than this app supports ({current}); please upgrade', {
        version: d.version,
        current: SCHEMA_VERSION,
      }),
    );
  let cur = d;
  for (let v = d.version; v < SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) throw new SchemaError(text('schema_no_migration', 'Missing migration from v{from} to v{to}', { from: v, to: v + 1 }));
    cur = { ...step(cur), version: v + 1 };
  }
  return cur as Project;
}
