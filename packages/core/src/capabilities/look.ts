/**
 * Look capabilities: the looks a design carries beyond the default set (library.looks), the look each target uses
 * (library.use), an object's own look, and new furniture types. A look's recipe is checked before it is stored, so a broken
 * recipe never reaches the canvas.
 */
import { z } from 'zod';
import { defineEdit, defineRead } from './capability.js';
import { text } from '../i18n.js';
import { DEFAULT_MATERIALS, materialOf } from '../looks/builtin.js';
import { DEFAULT_LOOKS, type LookTarget } from '../looks/defaults.js';
import { elementTarget, furnitureTarget, lookOf, lookRecipe, openingTarget, targetSize, wallTarget } from '../looks/resolve.js';
import { normalizeRecipe } from '../looks/recipe-convert.js';
import { buildRecipe, checkParamValue, checkRecipe, paramDefaults, type Recipe } from '../looks/script.js';
import { resolve, type Kind } from '../model/refs.js';
import { OPENING_KINDS, type Look, type Project } from '../model/schema.js';
import { TxError } from '../session/session.js';

const RECIPE_HELP = 'A recipe: { params?, seed?, script, materials? } with a JSONata script (see the recipe format in look_add)';

export const zTarget = z
  .string()
  .regex(/^(furniture|opening|element|wall):[A-Za-z0-9_-]+$/)
  .describe(
    "What a look draws: 'furniture:<type>' (a furniture type), 'opening:<door|sliding-door|gate|window|opening|glass-block>', 'element:<stair|pond|drain>' or 'wall:railing'",
  );

function checkTarget(p: Project, target: string) {
  const [kind, type] = target.split(':');
  const ok =
    kind === 'furniture'
      ? type in p.library.furniture
      : kind === 'opening'
        ? [...OPENING_KINDS, 'glass-block'].includes(type as never)
        : kind === 'wall'
          ? type === 'railing'
          : type in p.library.elements;
  if (!ok) throw new TxError('invalid-input', text('err_look_target', 'Unknown target {target}', { target }));
}

/**
 * The recipe (a script; a part list from before scripts is converted) if it builds at the size of every target it is meant for;
 * otherwise an error the caller can act on. Run in a capability's prepare step, since building is asynchronous.
 */
async function checkedRecipe(
  p: Project,
  input: unknown,
  targets: string[],
  types: Record<string, { size: { w: number; d: number; h: number } }> = {},
): Promise<Recipe> {
  const recipe = normalizeRecipe(input);
  for (const t of targets) {
    const [kind, type] = t.split(':');
    const size = kind === 'furniture' && types[type] ? types[type].size : targetSize(p, t);
    const problems = await checkRecipe(recipe, size);
    if (!problems.length) problems.push(...unknownMaterials(p, recipe as Recipe, await buildRecipe(recipe as Recipe, size)));
    if (problems.length) throw new TxError('invalid-input', text('err_recipe', 'The recipe has problems: {problems}', { problems: problems.join('; ') }));
  }
  return recipe as Recipe;
}

/** Materials a recipe uses (in what it built, or as a material parameter's default or choice) that it can't reach */
function unknownMaterials(p: Project, r: Recipe, built: { parts: { kind: string; mat?: string; mats?: Record<string, string> }[] }): string[] {
  const used = new Set<string>();
  for (const part of built.parts) for (const m of part.mat ? [part.mat] : Object.values(part.mats ?? {})) used.add(m);
  for (const d of Object.values(r.params ?? {}))
    if (d.format === 'material') for (const v of [d.default, ...(d.enum ?? [])]) if (typeof v === 'string') used.add(v);
  const missing = [...used].filter(m => !materialOf(m, r, p.library.materials));
  return missing.length ? [`unknown material ${missing.join(', ')}: use a default material, or define it in the recipe's materials`] : [];
}

function getLook(p: Project, id: string): Look {
  const look = p.library.looks?.[id] ?? Object.values(p.library.looks ?? {}).find(l => l.name === id);
  if (!look) throw new TxError('not-found', text('err_look_not_found', 'Cannot find look “{look}”', { look: id }));
  return look;
}
const lookId = (p: Project, ref: string) =>
  p.library.looks?.[ref] ? ref : (Object.entries(p.library.looks ?? {}).find(([, l]) => l.name === ref)?.[0] ?? ref);

function nextLookId(p: Project) {
  const used = new Set(Object.keys(p.library.looks ?? {}));
  let n = used.size + 1;
  while (used.has(`look-${n}`)) n++;
  return `look-${n}`;
}

/** An object that has a look (furniture, opening, element or railing) and its target */
function lookHolder(p: Project, ref: string) {
  for (const kind of ['furniture', 'opening', 'element', 'wall'] as Kind[]) {
    try {
      const e = resolve(p, kind, ref);
      if (e.kind === 'furniture') return { obj: e.obj, name: e.name, target: furnitureTarget(e.obj) };
      if (e.kind === 'opening') return { obj: e.obj, name: e.name, target: openingTarget(e.obj) };
      if (e.kind === 'element') return { obj: e.obj, name: e.name, target: elementTarget(e.obj) };
      if (e.kind === 'wall' && e.obj.kind === 'railing') return { obj: e.obj, name: e.name, target: wallTarget(e.obj) };
    } catch (err) {
      if (err instanceof TxError && err.code === 'ambiguous-ref') throw err;
    }
  }
  throw new TxError('not-found', text('err_look_object', 'Cannot find a piece of furniture, door, window, element or railing “{ref}”', { ref }));
}

export const lookAdd = defineEdit({
  name: 'look_add',
  title: 'Add a look',
  description: [
    'Add a look to the design: a recipe that draws furniture, doors and windows, or elements, like a font draws characters.',
    'Everyone who opens the design sees it. With use, every object of those targets switches to it; otherwise set it per object with look_set.',
    'Recipe format: { params?: {name: declaration}, seed?, script, materials? } where script is a JSONata expression (jsonata.org) returning a list of parts (nested lists are flattened), or { parts, plan } to draw its own plan symbol.',
    "Millimetres, angles in degrees. The script sees the object's size as $w, $d, $h and each parameter as $name (its default, or the value an object sets).",
    'Each parameter is declared with JSON Schema keywords: { type ("string" | "number" | "integer" | "boolean", or a list with "null" to let the script work it out), default (required; null only with "null" among the types), format? ("material" for a material id), enum? (the allowed values), enumTitles? ([{zh?, en?}] naming each enum value), minimum?, maximum?, title? ({zh?, en?}, shown to people; at least the project language), description? (English) }.',
    'Declare a parameter for whatever a person may want to change without a new look: materials of the main surfaces (format material with an enum of fitting materials), decoration on/off, a few shape choices (enum).',
    'Local frame: origin at the centre of the footprint on the floor (an opening: the centre of its sill; x along the wall, z across it), x across w, z across d with +z the front, y up.',
    'JSONata basics: ( $a := 1; $b := $a * 2; [ ... ] ) for local variables; [0..$n - 1].( $i := $; ... ) to repeat; cond ? a : b; = != < <= > >= and or $not(); + - * / %;',
    '$min([a, b]) $max([...]) $abs $floor $ceil $sqrt $power $round (half up) and our $sin $cos $tan $atan2 (degrees) $hypot $clamp(x, lo, hi) $lerp(a, b, t) $rnd(k) (pseudo-random 0..1, fixed per seed) $pi; $f := function($x) { ... } for helpers of your own.',
    'Always use $w, $d, $h and $variables: inside [list].( ... ) a bare name refers to the current item.',
    `Parts; mat is a material: one of the default library's (${Object.keys(DEFAULT_MATERIALS).join(' ')}) or one the recipe defines in materials: {id: glTF 2.0 material {name: {zh?, en?}, pbrMetallicRoughness: {baseColorFactor: [r, g, b, a] linear 0..1, metallicFactor, roughnessFactor}, alphaMode?: OPAQUE | BLEND}}:`,
    '$box([w, h, d], [x, y, z] centre, mat, r? edge radius, [rx, ry, rz]?); $block([w, h, d], x, y0 bottom, z, mat, r?); $cylinder(r, h, [x, y, z] centre, mat, {r2? top radius, axis? x|y|z, seg?, scale?}?);',
    '$sphere(r, at, mat, scale?); $lathe([[r, y]...] from the axis out and back, [x, y, z] base, mat, {scale?, seg?}?); $rod(from, to, r, mat); $ring(R, r, at, mat, axis? y|z); $tube([[x, y, z]...], r, mat);',
    '$panel([x, z], [x, z], y, h, t, mat); $extrude(plane side (profile x,y across z) | plan (profile x,z upwards), [[x, y] | {"arc": [cx, cy, r, a0, a1, clockwise]} | {"curve": [cx, cy, x, y]}], depth, mat, bevel?, at?);',
    "$fourLegs(w, d, inset, h, r, mat, square?); $noplan(part or list) leaves parts out of the plan symbol; $base({structure, water, grate}) is an element's own geometry.",
    'The plan symbol is the parts seen from above. Keep parts inside the w × d footprint and under h. A part list ({ let, parts } from before scripts) is still accepted and converted.',
  ].join(' '),
  input: z.object({
    name: z.string().min(1).describe('Name of the look, in the language the project data uses'),
    for: z.array(zTarget).min(1),
    recipe: z.unknown().describe(RECIPE_HELP),
    use: z.boolean().default(false).describe('Use it for every object of these targets'),
  }),
  label: i => text('log_look_add', 'Add look “{name}”', { name: i.name }),
  prepare: async (i, ctx) => {
    i.for.forEach(t => checkTarget(ctx.session.project, t));
    return { ...i, recipe: await checkedRecipe(ctx.session.project, i.recipe, i.for) };
  },
  apply: (p, i) => {
    i.for.forEach(t => checkTarget(p, t));
    const recipe = i.recipe as Recipe;
    const id = nextLookId(p);
    p.library.looks = { ...p.library.looks, [id]: { name: i.name, for: [...new Set(i.for)], recipe, version: 1 } };
    if (i.use) p.library.use = { ...p.library.use, ...Object.fromEntries(i.for.map(t => [t, id])) };
    return { id };
  },
});

export const lookUpdate = defineEdit({
  name: 'look_update',
  title: 'Change a look',
  description: 'Change a look of the design: its name, the targets it fits or its recipe (format in look_add). Every object drawn with it changes.',
  input: z.object({
    look: z.string().describe('Look ID or name'),
    name: z.string().min(1).optional(),
    for: z.array(zTarget).min(1).optional(),
    recipe: z.unknown().optional().describe(RECIPE_HELP),
  }),
  label: (i, p) => text('log_look_update', 'Change look “{name}”', { name: p.library.looks?.[lookId(p, i.look)]?.name ?? i.look }),
  prepare: async (i, ctx) => {
    const p = ctx.session.project,
      look = getLook(p, i.look),
      targets = i.for ?? look.for;
    targets.forEach(t => checkTarget(p, t));
    if (i.recipe !== undefined || i.for) return { ...i, recipe: await checkedRecipe(p, i.recipe ?? look.recipe, targets) };
  },
  apply: (p, i) => {
    const look = getLook(p, i.look),
      id = lookId(p, i.look);
    const targets = i.for ?? look.for;
    targets.forEach(t => checkTarget(p, t));
    const recipe = (i.recipe as Recipe | undefined) ?? look.recipe;
    p.library.looks![id] = { ...look, name: i.name ?? look.name, for: [...new Set(targets)], recipe, version: look.version + 1 };
    return { id, version: look.version + 1 };
  },
});

export const lookRemove = defineEdit({
  name: 'look_remove',
  title: 'Remove a look',
  description: 'Remove a look from the design; objects drawn with it go back to the default look.',
  input: z.object({ look: z.string().describe('Look ID or name') }),
  label: (i, p) => text('log_look_remove', 'Remove look “{name}”', { name: p.library.looks?.[lookId(p, i.look)]?.name ?? i.look }),
  apply: (p, i) => {
    getLook(p, i.look);
    const id = lookId(p, i.look);
    const { [id]: _gone, ...rest } = p.library.looks!;
    p.library.looks = rest;
    p.library.use = Object.fromEntries(Object.entries(p.library.use ?? {}).filter(([, v]) => v !== id));
    for (const o of [...p.furniture, ...p.elements, ...p.walls, ...p.walls.flatMap(w => w.openings)]) if (o.look === id) delete o.look;
    return { removed: id };
  },
});

export const lookUse = defineEdit({
  name: 'look_use',
  title: 'Use a look for a target',
  description:
    'Choose the look every object of a target uses in this design (like choosing the font of a whole text); look null goes back to the default. Objects with their own look keep it.',
  input: z.object({ target: zTarget, look: z.string().nullable().describe('Look ID or name, or null for the default') }),
  label: (i, p) =>
    i.look === null
      ? text('log_look_use_default', 'Use the default look for {target}', { target: i.target })
      : text('log_look_use', 'Use look “{name}” for {target}', { name: p.library.looks?.[lookId(p, i.look)]?.name ?? i.look, target: i.target }),
  apply: (p, i) => {
    checkTarget(p, i.target);
    const use = { ...p.library.use };
    if (i.look === null) delete use[i.target];
    else {
      const look = getLook(p, i.look);
      if (!look.for.includes(i.target))
        throw new TxError('invalid-input', text('err_look_fit', 'Look “{name}” doesn’t fit {target}', { name: look.name, target: i.target }));
      use[i.target] = lookId(p, i.look);
    }
    p.library.use = use;
    return { target: i.target, look: use[i.target] ?? null };
  },
});

export const lookSet = defineEdit({
  name: 'look_set',
  title: 'Give an object its own look',
  description:
    'Give one piece of furniture, door, window or element its own look (like setting one word in another font); look null goes back to the look of its target.',
  input: z.object({
    object: z.string().describe('ID or name of the furniture, opening or element'),
    look: z.string().nullable().describe('Look ID or name, or null'),
  }),
  label: (i, p) => text('log_look_set', 'Change the look of {object}', { object: lookHolder(p, i.object).name }),
  apply: (p, i) => {
    const h = lookHolder(p, i.object);
    if (i.look === null) delete h.obj.look;
    else {
      const look = getLook(p, i.look);
      if (!look.for.includes(h.target))
        throw new TxError('invalid-input', text('err_look_fit', 'Look “{name}” doesn’t fit {target}', { name: look.name, target: h.target }));
      h.obj.look = lookId(p, i.look);
    }
    return { id: h.obj.id, look: h.obj.look ?? null };
  },
});

export const furnitureTypeAdd = defineEdit({
  name: 'furniture_type_add',
  title: 'Add a furniture type',
  description:
    'Add a new furniture type to the design (a fish tank, a mahjong table…), with its default size and, optionally, a recipe for its look (format in look_add). Then place it with furniture_add.',
  input: z.object({
    type: z
      .string()
      .regex(/^[a-z][a-z0-9-]*$/)
      .describe('Type key, lowercase English (e.g. fish-tank)'),
    name: z.string().min(1).describe('Display name, in the language the project data uses'),
    group: z.string().optional().describe('Group name shown in the catalog, in the project language'),
    size: z.object({ w: z.number().positive(), d: z.number().positive(), h: z.number().positive() }),
    recipe: z.unknown().optional().describe(RECIPE_HELP),
  }),
  label: i => text('log_furniture_type_add', 'Add furniture type “{name}”', { name: i.name }),
  prepare: async (i, ctx) => {
    if (i.recipe !== undefined) return { ...i, recipe: await checkedRecipe(ctx.session.project, i.recipe, [`furniture:${i.type}`], { [i.type]: i }) };
  },
  apply: (p, i) => {
    if (p.library.furniture[i.type])
      throw new TxError('invalid-input', text('err_furniture_type_exists', 'Furniture type {type} already exists', { type: i.type }));
    p.library.furniture[i.type] = { name: i.name, ...(i.group ? { group: i.group } : {}), size: { ...i.size } };
    if (i.recipe === undefined) return { type: i.type };
    const target = `furniture:${i.type}`,
      recipe = i.recipe as Recipe,
      id = nextLookId(p);
    p.library.looks = { ...p.library.looks, [id]: { name: i.name, for: [target], recipe, version: 1 } };
    p.library.use = { ...p.library.use, [target]: id };
    return { type: i.type, look: id };
  },
});

const zParamValue = z.union([z.string().max(200), z.number(), z.boolean(), z.null()]);

/** A recipe's parameter declarations (JSON Schema keywords), for the agent */
const describeParams = (r: Recipe | null) => r?.params ?? {};

export const paramsSet = defineEdit({
  name: 'params_set',
  title: 'Set look parameters',
  description: [
    'Customise one piece of furniture, door or window, or element without changing its look: set values for the parameters its look declares',
    "(materials of its main surfaces, decoration on/off, shape choices…; look_get with its target lists them with their defaults). null puts a parameter back to the look's default; reset clears all.",
    'Values are checked against the declarations (type, enum, range; a material must exist), then by building the object with them. To change many objects, call it for each one that should change.',
  ].join(' '),
  input: z.object({
    object: z.string().describe('ID or name of a piece of furniture, door or window, or element'),
    params: z.record(z.string(), zParamValue).default({}).describe('Parameter → value (null: back to the default)'),
    reset: z.boolean().default(false).describe('Clear all values first'),
  }),
  label: (i, p) => text('log_params_set', 'Customise “{name}”', { name: lookHolder(p, i.object).name }),
  prepare: async (i, ctx) => {
    const p = ctx.session.project,
      { obj, target } = lookHolder(p, i.object);
    const recipe = lookRecipe(p, target, obj.look);
    const declared = paramDefaults(recipe ?? { params: {} });
    const unknown = Object.keys(i.params).filter(k => !(k in declared));
    if (unknown.length) {
      throw new TxError(
        'invalid-input',
        text('err_params_unknown', 'Its look has no parameter {names}; it has: {known}', {
          names: unknown.join(', '),
          known: Object.keys(declared).join(', ') || text('none', 'none'),
        }),
      );
    }
    for (const [k, v] of Object.entries(i.params)) {
      if (v === null) continue;
      const d = recipe!.params![k];
      const problem =
        checkParamValue(d, v, k) ??
        (d.format === 'material' && typeof v === 'string' && !materialOf(v, recipe, p.library.materials) ? `${k}: no material ${v}` : null);
      if (problem) throw new TxError('invalid-input', text('err_params_value', 'Can’t set it: {problem}', { problem }));
    }
    const merged = Object.fromEntries(Object.entries({ ...(i.reset ? {} : (obj.lookParams ?? {})), ...i.params }).filter(([, v]) => v !== null));
    const size = 'size' in obj ? obj.size : targetSize(p, target);
    try {
      await buildRecipe(recipe!, size, merged);
    } catch (e) {
      throw new TxError(
        'invalid-input',
        text('err_params_build', 'The look does not build with these values: {problem}', { problem: e instanceof Error ? e.message : String(e) }),
      );
    }
  },
  apply: (p, i) => {
    const { obj } = lookHolder(p, i.object);
    const next = { ...(i.reset ? {} : (obj.lookParams ?? {})) };
    for (const [k, v] of Object.entries(i.params)) {
      if (v === null) delete next[k];
      else next[k] = v;
    }
    if (Object.keys(next).length) obj.lookParams = next;
    else delete obj.lookParams;
    return { params: next };
  },
});

export const lookGet = defineRead({
  name: 'look_get',
  title: 'Read a look',
  description:
    'Read the recipe that draws a target in this design (its look, or the default one) or a look by ID or name, with the size it is usually built at and its parameters (what params_set can change per object). Start from it to change what something looks like.',
  input: z.object({ target: zTarget.optional(), look: z.string().optional().describe('Look ID or name') }),
  run: (i, ctx) => {
    const p = ctx.session.project;
    if (i.look) {
      const look = getLook(p, i.look);
      return {
        id: lookId(p, i.look),
        name: look.name,
        for: look.for,
        version: look.version,
        size: targetSize(p, look.for[0]),
        params: describeParams(look.recipe),
        recipe: look.recipe,
      };
    }
    if (!i.target) throw new TxError('invalid-input', text('err_look_get_input', 'Give a target or a look'));
    checkTarget(p, i.target);
    const id = lookOf(p, i.target as LookTarget);
    if (id)
      return {
        id,
        name: p.library.looks![id].name,
        for: p.library.looks![id].for,
        size: targetSize(p, i.target),
        params: describeParams(p.library.looks![id].recipe),
        recipe: p.library.looks![id].recipe,
      };
    const recipe = DEFAULT_LOOKS[i.target as LookTarget];
    return { id: null, default: true, size: targetSize(p, i.target), params: describeParams(recipe ?? null), recipe: recipe ?? null };
  },
});

export const lookImport = defineEdit({
  name: 'look_import',
  title: 'Add a look from a library',
  description:
    "Copy a look from a look library into the design (or bring a copied look up to the library's newer version). The design keeps its own copy, so everyone who opens it sees the same thing. Get the look with library_look_get.",
  input: z.object({
    name: z.string().min(1),
    for: z.array(zTarget).min(1),
    recipe: z.unknown().describe(RECIPE_HELP),
    types: z
      .record(
        z.string(),
        z.object({
          name: z.string(),
          group: z.string().optional(),
          size: z.object({ w: z.number().positive(), d: z.number().positive(), h: z.number().positive() }),
        }),
      )
      .optional()
      .describe('Furniture types the look draws that the design may not have yet'),
    source: z.object({
      library: z.string(),
      look: z.string(),
      version: z.union([
        z.string(),
        z
          .number()
          .int()
          .positive()
          .transform(n => `${n}.0.0`),
      ]),
    }),
    use: z.boolean().default(false).describe('Use it for every object of these targets'),
    replace: z.string().optional().describe('ID of a look of the design that this becomes (e.g. after saving it to a library)'),
  }),
  label: (i, p) =>
    i.replace || Object.values(p.library.looks ?? {}).some(l => l.source?.library === i.source.library && l.source.look === i.source.look)
      ? text('log_look_import_update', 'Update look “{name}” from its library', { name: i.name })
      : text('log_look_import', 'Add look “{name}” from a library', { name: i.name }),
  prepare: async (i, ctx) => {
    const p = ctx.session.project;
    i.for.forEach(t => (t.startsWith('furniture:') && i.types?.[t.slice(10)] ? null : checkTarget(p, t)));
    return { ...i, recipe: await checkedRecipe(p, i.recipe, i.for, i.types ?? {}) };
  },
  apply: (p, i) => {
    for (const [type, def] of Object.entries(i.types ?? {}))
      p.library.furniture[type] ??= { name: def.name, ...(def.group ? { group: def.group } : {}), size: { ...def.size } };
    i.for.forEach(t => checkTarget(p, t));
    const recipe = i.recipe as Recipe;
    const looks = p.library.looks ?? {};
    // Copied before: bring that copy up to date instead of adding a second one
    if (i.replace) getLook(p, i.replace);
    const existing = i.replace
      ? lookId(p, i.replace)
      : Object.entries(looks).find(([, l]) => l.source?.library === i.source.library && l.source.look === i.source.look)?.[0];
    const id = existing ?? nextLookId(p);
    p.library.looks = { ...looks, [id]: { name: i.name, for: [...new Set(i.for)], recipe, version: (looks[id]?.version ?? 0) + 1, source: { ...i.source } } };
    if (i.use) p.library.use = { ...p.library.use, ...Object.fromEntries(i.for.map(t => [t, id])) };
    return { id, updated: !!existing };
  },
});
