/** Look library files (#93): the built-in files, parsing, groups and types, parameters as JSON Schema, materials, the v7 migration */
import { sampleFile, libraryFile } from '../support.js';
import { describe, expect, it } from 'vitest';
import {
  BUILTIN_LIBRARIES,
  buildRecipe,
  checkParamValue,
  compareVersions,
  createProject,
  createRegistry,
  DEFAULT_LIBRARY,
  DEFAULT_MATERIALS,
  DEFAULT_TYPES,
  designLookOf,
  FURNITURE_TYPES,
  groupedLooks,
  libraryLookOf,
  libraryRecipe,
  lookGroup,
  lookSizeOf,
  materialOf,
  materialsUsed,
  migrate,
  normalizeParams,
  parseLibrary,
  Session,
  validate,
  type LookLibrary,
} from '../../src/index.js';

const registry = createRegistry();
const sample = () => sampleFile();
const file = (name: string) => libraryFile(name);
const harness = (p = migrate(sample())) => {
  const session = new Session(p);
  return { session, call: (name: string, input: unknown = {}) => registry.call(name, input, { session, actor: { kind: 'agent' } }) };
};

describe('library files', () => {
  it('the built-in files parse, and every material, group and type their looks name resolves', async () => {
    for (const lib of BUILTIN_LIBRARIES) {
      expect(parseLibrary(JSON.parse(JSON.stringify(lib)), DEFAULT_LIBRARY)).toEqual(lib);
      for (const [id, look] of Object.entries(lib.looks)) {
        expect(lookGroup(look), `${lib.id}/${id} group`).toBeTruthy();
        const recipe = libraryRecipe(lib, look);
        const built = await buildRecipe(recipe, lookSizeOf(look));
        for (const p of built.parts)
          for (const m of p.kind === 'base' ? Object.values(p.mats) : [p.mat]) expect(materialOf(m, recipe), `${lib.id}/${id} ${m}`).toBeTruthy();
        for (const d of Object.values(look.params ?? {}))
          for (const v of [d.default, ...(d.enum ?? [])]) {
            if (d.format === 'material') expect(materialOf(String(v), recipe), `${lib.id}/${id} param ${v}`).toBeTruthy();
          }
      }
    }
  });

  it('the files on disk have the $schema and format the schema file describes', () => {
    const schema = file('looklib.schema.json');
    for (const name of ['default.looklib.json', 'chinese.looklib.json']) {
      const f = file(name);
      expect(f.$schema).toBe('./looklib.schema.json');
      for (const k of schema.required) expect(f, `${name} ${k}`).toHaveProperty(k);
      for (const k of Object.keys(f)) expect(schema.properties, `${name} ${k}`).toHaveProperty(k);
    }
  });

  it('rejects a bad file with a readable problem', () => {
    const lib = file('chinese.looklib.json');
    expect(() => parseLibrary({ ...lib, format: 'x' })).toThrow(/format/);
    expect(() => parseLibrary({ ...lib, looks: { a: { ...lib.looks.teatable, group: 'nowhere' } } }, DEFAULT_LIBRARY)).toThrow(/unknown group nowhere/);
    expect(() => parseLibrary({ ...lib, looks: { a: { ...lib.looks.teatable, params: { wood: { type: 'number', default: 'x' } } } } })).toThrow(
      /default must be number/,
    );
  });

  it('furniture types and the catalogue come from the default library; merged types replace the old ones', () => {
    expect(FURNITURE_TYPES).toBe(DEFAULT_TYPES);
    for (const t of ['sofa', 'bed', 'shower', 'planter']) expect(DEFAULT_TYPES[t], t).toBeTruthy();
    for (const t of ['sofa3', 'sofa2', 'bed18', 'bed15', 'bed12', 'shower5']) expect(DEFAULT_TYPES[t], t).toBeUndefined();
    expect(createProject({ id: 'x', name: 'x', language: 'en' }).library.furniture.sofa).toEqual({
      name: 'Sofa',
      group: 'Living room',
      size: { w: 2100, d: 900, h: 800 },
    });
  });

  it('groups come in the order the libraries declare them, only those with looks', () => {
    const groups = groupedLooks(DEFAULT_LIBRARY).map(g => g.group);
    expect(groups).toEqual(Object.keys(DEFAULT_LIBRARY.groups!));
    const chinese = BUILTIN_LIBRARIES.find(l => l.id === 'builtin-chinese')!;
    expect(groupedLooks(chinese).map(g => g.group)).toEqual(['living', 'kitchen', 'yard']);
    expect(groupedLooks({ ...chinese, looks: { x: { name: { en: 'x' }, for: ['furniture:mystery'], version: '1.0.0', script: '[]' } } })).toEqual([
      { group: null, looks: [['x', expect.anything()]] },
    ]);
  });

  it('a look outside the default library reaches its own materials, then the default ones', () => {
    const chinese = BUILTIN_LIBRARIES.find(l => l.id === 'builtin-chinese')!;
    const shrine = libraryRecipe(chinese, chinese.looks.shrine);
    expect(materialOf('lacquer', shrine)).toBe(chinese.materials!.lacquer);
    expect(materialOf('white', shrine)).toBe(DEFAULT_MATERIALS.white);
    expect(materialOf('lacquer')).toBeUndefined();
    expect(Object.keys(materialsUsed(chinese.looks.shrine, chinese.materials!)).sort()).toEqual(['gold', 'lacquer']);
  });

  it('semver compares by number; old numeric versions count as majors', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
    expect(compareVersions(2, '2.0.0')).toBe(0);
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
  });
});

describe('parameters', () => {
  it('values are checked against the declaration', () => {
    const d = { type: ['number', 'null'] as ('number' | 'null')[], default: null, minimum: 120, maximum: 260 };
    expect(checkParamValue(d, 200)).toBeNull();
    expect(checkParamValue(d, null)).toBeNull();
    expect(checkParamValue(d, 100, 'armWidth')).toBe('armWidth must be at least 120');
    expect(checkParamValue(d, 'wide', 'armWidth')).toBe('armWidth must be number');
    expect(checkParamValue({ type: 'string', default: 'none', enum: ['none', 'left'] }, 'right', 'chaise')).toBe('chaise must be one of none, left');
    expect(checkParamValue({ type: 'integer', default: 1 }, 1.5)).toMatch(/integer/);
  });

  it('declarations from before v7 become JSON Schema declarations', () => {
    expect(
      normalizeParams({ fabric: 'fabric', decor: true, arm: null, n: { default: 2, label: '数量', doc: 'How many', options: [1, 2, 3], min: 1, max: 3 } }),
    ).toEqual({
      fabric: { type: 'string', default: 'fabric', format: 'material' },
      decor: { type: 'boolean', default: true },
      arm: { type: ['number', 'null'], default: null },
      n: { type: 'number', default: 2, enum: [1, 2, 3], minimum: 1, maximum: 3, title: { zh: '数量' }, description: 'How many' },
    });
  });
});

describe('v7 migration', () => {
  it('merges furniture types without changing how anything looks', () => {
    const before = sample();
    const p = migrate(before);
    const types = new Set(p.furniture.map(f => f.type));
    for (const old of ['sofa3', 'sofa2', 'bed18', 'bed15', 'bed12', 'shower5']) expect(types.has(old), old).toBe(false);
    for (const f of before.furniture) {
      const after = p.furniture.find(x => x.id === f.id)!;
      expect(after.size, f.id).toEqual(f.size);
      if (f.type === 'shower5') expect(after).toMatchObject({ type: 'shower', lookParams: { shape: 'diamond' } });
      if (f.type === 'bed') expect(after.type).toBe('planter');
    }
    expect(validate(p)).toEqual([]);
  });

  it('floors use library materials (teak flooring was "wood"), and library.materials keeps only the design\'s own', () => {
    const v6 = { ...migrate(sample()), version: 6 } as any;
    v6.spaces[0].floor = 'wood';
    v6.library.materials = { wood: { name: '柚木地板', tileSize: 1200 }, moss: { name: '苔藓' } };
    const p = migrate(v6);
    expect(p.spaces[0].floor).toBe('teak');
    expect(Object.keys(p.library.materials)).toEqual(['moss']);
    expect(p.library.materials.moss.name).toEqual({ zh: '苔藓' });
    expect(validate(p)).toEqual([]);
  });

  it('copied looks get semver sources and JSON Schema parameters', () => {
    const v6 = { ...migrate(sample()), version: 6 } as any;
    v6.library.looks = {
      'look-1': {
        name: 'A',
        for: ['furniture:sofa3'],
        recipe: { params: { top: 'wood' }, script: '[]' },
        version: 1,
        source: { library: 'lib1', look: 'k', version: 3 },
      },
    };
    v6.library.use = { 'furniture:sofa3': 'look-1' };
    const p = migrate(v6);
    expect(p.library.looks!['look-1']).toMatchObject({
      for: ['furniture:sofa'],
      recipe: { params: { top: { type: 'string', format: 'material', default: 'wood' } } },
      source: { version: '3.0.0' },
    });
    expect(p.library.use).toEqual({ 'furniture:sofa': 'look-1' });
  });
});

describe('capabilities', () => {
  it('wall_update sets a finish from the materials; unknown ones are refused; null goes back to paint', async () => {
    const h = harness();
    const w = h.session.project.walls.find(x => x.kind === 'bearing')!;
    expect((await h.call('wall_update', { wall: w.id, finish: 'redbrick' })).ok).toBe(true);
    expect(h.session.project.walls.find(x => x.id === w.id)!.finish).toBe('redbrick');
    expect((await h.call('wall_update', { wall: w.id, finish: 'gingerbread' })).error?.message).toMatch(/gingerbread/);
    await h.call('wall_update', { wall: w.id, finish: null });
    expect(h.session.project.walls.find(x => x.id === w.id)!.finish).toBeUndefined();
  });

  it('a railing is drawn by a look and customised with params_set like any object', async () => {
    const h = harness();
    const r = h.session.project.walls.find(x => x.kind === 'railing')!;
    expect((await h.call('params_set', { object: r.id, params: { infill: 'bars' } })).ok).toBe(true);
    expect((await h.call('params_set', { object: r.id, params: { infill: 'rope' } })).error?.message).toMatch(/infill must be one of glass, bars/);
    const look = await h.call('look_get', { target: 'wall:railing' });
    expect((look.result as { params: object }).params).toHaveProperty('infill');
  });

  it('look_add refuses materials the look cannot reach, and accepts ones it defines', async () => {
    const h = harness();
    const bad = await h.call('look_add', { name: 'x', for: ['furniture:dining'], recipe: { script: `[$box([$w, $h, $d], [0, $h / 2, 0], 'velvet')]` } });
    expect(bad.error?.message).toMatch(/unknown material velvet/);
    const velvet = { name: { zh: '丝绒' }, pbrMetallicRoughness: { baseColorFactor: [0.3, 0.05, 0.1, 1], roughnessFactor: 1 } };
    const ok = await h.call('look_add', {
      name: 'x',
      for: ['furniture:dining'],
      recipe: { script: `[$box([$w, $h, $d], [0, $h / 2, 0], 'velvet')]`, materials: { velvet } },
    });
    expect(ok.ok, ok.error?.message).toBe(true);
  });

  it("a library look goes into a design with its materials and type, and back out in the library's structure", async () => {
    const lib: LookLibrary = {
      format: 'plinth-looks',
      formatVersion: 1,
      id: 'games',
      name: { zh: '游戏' },
      version: '1.0.0',
      materials: { felt: { name: { zh: '台呢' }, pbrMetallicRoughness: { baseColorFactor: [0.05, 0.3, 0.1, 1] } } },
      looks: {
        mahjong: {
          name: { zh: '麻将桌' },
          for: ['furniture:mahjong'],
          newType: { name: { zh: '麻将桌' }, group: 'living', size: { w: 900, d: 900, h: 750 } },
          version: '1.2.0',
          script: `[$box([$w, 40, $d], [0, $h - 20, 0], 'felt')]`,
        },
      },
    };
    const h = harness();
    const k = designLookOf(lib, 'mahjong', 'zh');
    expect(k).toMatchObject({
      name: '麻将桌',
      types: { mahjong: { name: '麻将桌', group: '客厅' } },
      source: { library: 'games', look: 'mahjong', version: '1.2.0' },
    });
    expect(Object.keys(k.recipe.materials!)).toEqual(['felt']);
    const r = await h.call('look_import', { ...k, use: true });
    expect(r.ok, r.error?.message).toBe(true);
    const id = (r.result as { id: string }).id,
      p = h.session.project;
    expect(libraryLookOf(p, p.library.looks![id])).toMatchObject({
      name: { zh: '麻将桌' },
      newType: { group: 'living', size: { w: 900, d: 900, h: 750 } },
      materials: { felt: lib.materials!.felt },
    });
  });
});
