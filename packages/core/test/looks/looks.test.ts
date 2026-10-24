/** Looks in a design: adding, using, per-object looks, new furniture types, all through capabilities */
import { sampleFile } from '../support.js';
import { describe, expect, it } from 'vitest';
import {
  buildRecipe,
  createRegistry,
  furnitureTarget,
  lookRecipe,
  migrate,
  SCHEMA_VERSION,
  Session,
  validate,
  type Project,
  type Recipe,
} from '../../src/index.js';

const registry = createRegistry();
const sample = () => migrate(sampleFile());

function harness(p: Project) {
  const session = new Session(p);
  const call = (name: string, input: unknown = {}) => registry.call(name, input, { session, actor: { kind: 'agent' } });
  return { session, call };
}

/** A round table: a top on one stem */
const roundTable: Recipe = {
  params: { top: { type: 'string', format: 'material', default: 'wood' } },
  script: `(
    $r := $min([$w, $d]) / 2;
    [$cylinder($r, 40, [0, $h - 20, 0], $top), $cylinder(40, $h - 40, [0, ($h - 40) / 2, 0], 'woodDark')]
  )`,
};

describe('looks', () => {
  it('an old project migrates to the current version and stays valid', () => {
    const p = sample();
    expect(p.version).toBe(SCHEMA_VERSION);
    expect(p.library.looks).toBeUndefined();
    expect(validate(p)).toEqual([]);
  });

  it('look_add with use draws every object of the target with it; one undo reverts', async () => {
    const h = harness(sample());
    const table = h.session.project.furniture.find(f => f.type === 'dining')!;
    const before = lookRecipe(h.session.project, furnitureTarget(table), table.look);
    const r = await h.call('look_add', { name: '圆餐桌', for: ['furniture:dining'], recipe: roundTable, use: true });
    expect(r.ok, r.error?.message).toBe(true);
    expect(lookRecipe(h.session.project, furnitureTarget(table))).toEqual(roundTable);
    await h.call('history_undo');
    expect(lookRecipe(h.session.project, furnitureTarget(table))).toBe(before);
  });

  it('look_set gives one object its own look, and look_remove sends it back to the default', async () => {
    const h = harness(sample());
    const [a, b] = h.session.project.furniture.filter(f => f.type === 'dining' || f.type === 'coffee');
    await h.call('look_add', { name: 'Round', for: ['furniture:dining', 'furniture:coffee'], recipe: roundTable });
    const set = await h.call('look_set', { object: a.id, look: 'Round' });
    expect(set.ok, set.error?.message).toBe(true);
    const p = h.session.project;
    expect(lookRecipe(p, furnitureTarget(a), p.furniture.find(f => f.id === a.id)!.look)).toEqual(roundTable);
    expect(lookRecipe(p, furnitureTarget(b), b.look)).not.toEqual(roundTable);
    await h.call('look_remove', { look: 'Round' });
    expect(h.session.project.furniture.find(f => f.id === a.id)!.look).toBeUndefined();
    expect(validate(h.session.project)).toEqual([]);
  });

  it('rejects a recipe that does not build, a look that does not fit, and an unknown target', async () => {
    const h = harness(sample());
    const bad = await h.call('look_add', {
      name: 'x',
      for: ['furniture:dining'],
      recipe: { parts: [{ kind: 'box', mat: 'wood', size: ['w', 'h', 'q'], at: [0, 0, 0] }] },
    });
    expect(bad.ok).toBe(false);
    expect(bad.error?.message).toMatch(/unknown variable \$q/);
    await h.call('look_add', { name: 'Round', for: ['furniture:dining'], recipe: roundTable });
    const sofa = h.session.project.furniture.find(f => f.type === 'sofa')!;
    const misfit = await h.call('look_set', { object: sofa.id, look: 'Round' });
    expect(misfit.ok).toBe(false);
    expect((await h.call('look_use', { target: 'furniture:no-such', look: null })).ok).toBe(false);
  });

  it('furniture_type_add registers a new type with its look, ready to place', async () => {
    const h = harness(sample());
    const r = await h.call('furniture_type_add', { type: 'mahjong', name: '麻将桌', size: { w: 900, d: 900, h: 750 }, recipe: roundTable });
    expect(r.ok, r.error?.message).toBe(true);
    const placed = await h.call('furniture_add', { type: 'mahjong', space: '客厅' });
    expect(placed.ok, placed.error?.message).toBe(true);
    const f = h.session.project.furniture.find(x => x.type === 'mahjong')!;
    expect(lookRecipe(h.session.project, furnitureTarget(f))).toEqual(roundTable);
  });

  it('a part list from before scripts is accepted and stored as a script; old designs migrate their looks', async () => {
    const h = harness(sample());
    const old = { parts: [{ kind: 'box', mat: 'wood', size: ['w', 'h', 'd'], at: [0, 'h / 2', 0] }] };
    const r = await h.call('look_add', { name: 'Block', for: ['furniture:dining'], recipe: old });
    expect(r.ok, r.error?.message).toBe(true);
    const stored = h.session.project.library.looks![(r.result as { id: string }).id].recipe;
    expect(stored.script).toContain('$box');
    const v4 = {
      ...sample(),
      version: 4,
      library: { ...sample().library, looks: { 'look-1': { name: 'Block', for: ['furniture:dining'], recipe: old, version: 1 } } },
    };
    expect(migrate(v4).library.looks!['look-1'].recipe).toEqual(stored);
  });

  it('params_set customises one object without changing its look; unknown names and values that do not build are refused', async () => {
    const h = harness(sample());
    const sofa = h.session.project.furniture.find(f => f.type === 'sofa')!;
    const r = await h.call('params_set', { object: sofa.id, params: { fabric: 'linen', decor: false } });
    expect(r.ok).toBe(false);
    expect(r.error?.message).toMatch(/decor/);
    const ok = await h.call('params_set', { object: sofa.id, params: { fabric: 'linen' } });
    expect(ok.ok, ok.error?.message).toBe(true);
    const f = () => h.session.project.furniture.find(x => x.id === sofa.id)!;
    expect(f().lookParams).toEqual({ fabric: 'linen' });
    expect(h.session.project.library.looks).toBeUndefined();
    const built = await buildRecipe(lookRecipe(h.session.project, furnitureTarget(f()))!, f().size, f().lookParams);
    expect(built.parts.some(p => p.kind === 'box' && p.mat === 'linen')).toBe(true);
    const velvet = await h.call('params_set', { object: sofa.id, params: { fabric: 'velvet' } });
    expect(velvet.error?.message).toMatch(/fabric must be one of fabric, cushion/);
    expect((await h.call('params_set', { object: sofa.id, params: { fabric: 3 } })).error?.message).toMatch(/fabric must be string/);
    await h.call('params_set', { object: sofa.id, params: { fabric: null } });
    expect(f().lookParams).toBeUndefined();
    const other = h.session.project.furniture.find(x => x.type === 'sofa' && x.id !== sofa.id);
    if (other) expect(other.lookParams).toBeUndefined();
  });

  it("look_get lists a look's parameters with their defaults", async () => {
    const h = harness(sample());
    const r = await h.call('look_get', { target: 'furniture:coffee' });
    expect((r.result as { params: Record<string, { default: unknown }> }).params).toMatchObject({
      top: { type: 'string', format: 'material', default: 'birch' },
      decor: { type: 'boolean', default: true },
    });
  });

  it('a window can get its own look', async () => {
    const h = harness(sample());
    const win = h.session.project.walls.flatMap(w => w.openings).find(o => o.kind === 'window' && !o.glazing)!;
    const shutter: Recipe = { script: `[$box([$w, $h, 40], [0, $h / 2, 0], 'wood')]` };
    await h.call('look_add', { name: 'Shutter', for: ['opening:window'], recipe: shutter });
    const r = await h.call('look_set', { object: win.id, look: 'Shutter' });
    expect(r.ok, r.error?.message).toBe(true);
  });
});

describe('looks from libraries', () => {
  it('look_import copies a look with its source and new furniture types; importing a newer version updates the same copy', async () => {
    const h = harness(sample());
    const types = { mahjong: { name: '麻将桌', size: { w: 900, d: 900, h: 750 } } };
    const r1 = await h.call('look_import', {
      name: '麻将桌',
      for: ['furniture:mahjong'],
      recipe: roundTable,
      types,
      source: { library: 'lib1', look: 'lk1', version: 1 },
      use: true,
    });
    expect(r1.ok, r1.error?.message).toBe(true);
    const id = (r1.result as { id: string }).id;
    let p = h.session.project;
    expect(p.library.furniture.mahjong.name).toBe('麻将桌');
    expect(p.library.looks![id].source).toEqual({ library: 'lib1', look: 'lk1', version: '1.0.0' });
    const r2 = await h.call('look_import', {
      name: '麻将桌',
      for: ['furniture:mahjong'],
      recipe: { ...roundTable, seed: 2 },
      source: { library: 'lib1', look: 'lk1', version: '2.0.0' },
    });
    p = h.session.project;
    expect((r2.result as { id: string }).id).toBe(id);
    expect(Object.keys(p.library.looks!)).toHaveLength(1);
    expect(p.library.looks![id].source?.version).toBe('2.0.0');
  });
  it('look_import with replace links a design look to the library it was saved to', async () => {
    const h = harness(sample());
    await h.call('look_add', { name: 'Round', for: ['furniture:dining'], recipe: roundTable });
    const r = await h.call('look_import', {
      name: 'Round',
      for: ['furniture:dining'],
      recipe: roundTable,
      source: { library: 'lib1', look: 'lk9', version: 1 },
      replace: 'Round',
    });
    expect(r.ok, r.error?.message).toBe(true);
    expect(Object.values(h.session.project.library.looks!)).toHaveLength(1);
    expect(Object.values(h.session.project.library.looks!)[0].source?.look).toBe('lk9');
  });
});
