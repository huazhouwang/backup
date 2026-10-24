import { describe, expect, it } from 'vitest';
import {
  BUILTIN_LIBRARIES,
  buildRecipe,
  builtPlan,
  checkRecipe,
  DEFAULT_LOOKS,
  libraryRecipe,
  normalizeRecipe,
  toScript,
  type PartRecipe,
  evalExpr,
  FURNITURE_TYPES,
  inspectRecipe,
  parseExpr,
  type Recipe,
} from '../../src/index.js';

describe('expressions', () => {
  it('evaluates arithmetic, comparisons, ternaries and functions', () => {
    expect(evalExpr('1 + 2 * 3', {})).toBe(7);
    expect(evalExpr('(w - 2 * arm) / n', { w: 2000, arm: 100, n: 3 })).toBe(600);
    expect(evalExpr('w >= 1200 ? 2 : 1', { w: 1500 })).toBe(2);
    expect(evalExpr('min(3, max(1, 2))', {})).toBe(2);
    expect(evalExpr('round(sin(90) * 100)', {})).toBe(100);
    expect(evalExpr('atan2(1, 1)', {})).toBeCloseTo(45);
    expect(evalExpr('-x % 2', { x: 3 })).toBe(-1);
    expect(evalExpr('!0 && 2', {})).toBe(2);
  });
  it('rnd is fixed per seed and key', () => {
    expect(evalExpr('rnd(3)', {}, 7)).toBe(evalExpr('rnd(3)', {}, 7));
    expect(evalExpr('rnd(3)', {}, 7)).not.toBe(evalExpr('rnd(4)', {}, 7));
    for (let k = 0; k < 200; k++) {
      const v = evalExpr(`rnd(${k})`, {}, 3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('reports what it cannot read', () => {
    expect(() => parseExpr('1 +')).toThrow(/end/);
    expect(() => parseExpr('foo(1)')).toThrow(/unknown function/);
    expect(() => parseExpr('2 $ 3')).toThrow(/cannot read/);
    expect(() => evalExpr('w + q', { w: 1 })).toThrow(/unknown name "q"/);
  });
});

describe('recipes', () => {
  const size = (target: string) => {
    const [kind, type] = target.split(':');
    if (kind === 'furniture') return FURNITURE_TYPES[type].size;
    if (kind === 'opening') return { w: 1200, d: 180, h: 1500 };
    if (kind === 'wall') return { w: 3000, d: 60, h: 1100 };
    return { w: 2000, d: 2000, h: 3000 };
  };
  it('every default look builds at its size, half and twice that size', async () => {
    for (const [target, recipe] of Object.entries(DEFAULT_LOOKS)) {
      expect(await checkRecipe(recipe, size(target)), target).toEqual([]);
    }
  });
  it('every built-in library look builds for each of its targets', async () => {
    for (const lib of BUILTIN_LIBRARIES)
      for (const [id, look] of Object.entries(lib.looks)) {
        for (const t of look.for) expect(await checkRecipe(libraryRecipe(lib, look), look.newType?.size ?? size(t)), `${lib.id}/${id} ${t}`).toEqual([]);
      }
  });
  it('every catalog furniture type has a default look', () => {
    for (const type of Object.keys(FURNITURE_TYPES)) expect(DEFAULT_LOOKS[`furniture:${type}`], type).toBeTruthy();
  });
  it('every furniture look has a plan symbol inside its footprint', async () => {
    for (const type of Object.keys(FURNITURE_TYPES)) {
      const r = DEFAULT_LOOKS[`furniture:${type}`],
        s = FURNITURE_TYPES[type].size;
      const sym = builtPlan(await buildRecipe(r, s));
      expect(sym.items.length, type).toBeGreaterThan(0);
      for (const it of sym.items)
        for (const [x, z] of it.ring) {
          expect(Math.abs(x), `${type} x`).toBeLessThanOrEqual(s.w / 2 + 200);
          expect(Math.abs(z), `${type} z`).toBeLessThanOrEqual(s.d / 2 + 200);
        }
    }
  });
  it('a longer sofa gets more cushions', async () => {
    const count = async (w: number) =>
      (await buildRecipe(DEFAULT_LOOKS['furniture:sofa'], { w, d: 900, h: 800 })).parts.filter(p => p.kind === 'box' && p.mat === 'cushion').length;
    expect(await count(3000)).toBeGreaterThan(await count(2100));
  });
  it('rejects bad recipes with readable problems', async () => {
    const at = (script: string) => checkRecipe({ script }, { w: 1000, d: 1, h: 1 }).then(p => p[0]);
    expect(await at(`[{"kind": "box", "mat": "wood", "size": [$w, $h, $d]}]`)).toMatch(/at/);
    expect(await at(`[$box([1, 1, 1], [0, 0, 0], 42)]`)).toMatch(/mat/);
    expect(await at(`[$box([$w - 2000, 10, 10], [0, 0, 0], 'wood')]`)).toMatch(/width must be positive/);
    expect(await at(`[$box([1, 1, 1], [0, 0, 0]`)).toMatch(/script/);
    expect(await checkRecipe({ parts: [] }, { w: 1, d: 1, h: 1 })).not.toEqual([]);
  });
  it('guardrails stop runaway scripts', async () => {
    const at = (script: string) => checkRecipe({ script }, { w: 1000, d: 500, h: 500 }).then(p => p[0] ?? '');
    expect(await at(`( $f := function($n) { $f($n + 1) }; $f(0) )`)).toMatch(/D1011|D1012/);
    expect(await at(`[1..100000].$box([10, 10, 10], [0, 0, 0], 'wood')`)).toMatch(/D2015|parts/);
    expect(await at(`[1..4000].$box([10, 10, 10], [0, 0, 0], 'wood')`)).toMatch(/parts/);
  });
  it('scripts cannot reach the host', async () => {
    // Each either fails or builds nothing: no way to the host's functions or globals
    for (const script of [
      `$eval("constructor")`,
      `constructor.constructor("return process")()`,
      `$box.constructor("return globalThis")()`,
      `$lookup($, "__proto__")`,
      `$string($box)`,
    ]) {
      const built = await buildRecipe({ script }, { w: 1000, d: 500, h: 500 }).then(
        b => b.parts,
        () => [],
      );
      expect(built, script).toEqual([]);
    }
    expect((globalThis as Record<string, unknown>).process).toBeDefined();
  });
  it('parameters reach the script, with their defaults', async () => {
    const r: Recipe = {
      params: { mat: { type: 'string', format: 'material', default: 'wood' }, top: { type: 'number', default: 50, title: { zh: '厚度' } } },
      script: `[$box([$w, $top, $d], [0, $h - $top / 2, 0], $mat)]`,
    };
    const a = (await buildRecipe(r, { w: 1000, d: 500, h: 700 })).parts[0];
    const b = (await buildRecipe(r, { w: 1000, d: 500, h: 700 }, { mat: 'birch', top: 30 })).parts[0];
    expect(a).toMatchObject({ mat: 'wood', size: [1000, 50, 500] });
    expect(b).toMatchObject({ mat: 'birch', size: [1000, 30, 500] });
    expect(await checkRecipe({ params: { box: { type: 'number', default: 1 } }, script: '[]' }, { w: 1, d: 1, h: 1 })).not.toEqual([]);
    expect(await checkRecipe({ params: { n: { type: 'number', default: 'x' } }, script: '[]' }, { w: 1, d: 1, h: 1 })).not.toEqual([]);
  });
  it('part lists from before scripts convert to scripts that build the same parts', async () => {
    const old: PartRecipe = {
      let: { r: 'min(w, d) / 2', ring: 'r * 0.9' },
      parts: [
        { kind: 'cylinder', mat: 'wood', r: 'ring', h: 40, at: [0, 'h - 20', 0], seg: 40 },
        {
          kind: 'repeat',
          count: 'w > 500 ? 4 : 3',
          as: 'k',
          let: { a: 'k * 90' },
          parts: [{ kind: 'rod', mat: 'metal', from: ['cos(a) * r', 0, 'sin(a) * r'], to: [0, 'h - 40', 0], r: 10 }],
        },
        { kind: 'if', when: '!(w < 300) && d != 0', parts: [{ kind: 'box', mat: 'dark', size: [10, 10, 10], at: [0, '+(w > 100) * 5', 0], plan: false }] },
      ],
    };
    expect(normalizeRecipe(old)).toEqual(toScript(old));
    const s = { w: 800, d: 600, h: 750 };
    const { buildParts } = await import('../../src/looks/recipe.js');
    expect((await buildRecipe(toScript(old), s)).parts).toEqual(buildParts(old, s));
  });
});

describe('inspection', () => {
  it('finds parts out of bounds and floating, and draws rough views', async () => {
    const r: Recipe = {
      script: `[
      $box([$w, 40, $d], [0, $h - 20, 0], 'wood'),
      $box([60, $h - 40, 60], [0, ($h - 40) / 2, 0], 'wood'),
      $sphere(50, [0, $h + 400, 0], 'gold'),
      $box([100, 10, 100], [$w, 5, 0], 'wood')
    ]`,
    };
    const i = await inspectRecipe(r, { w: 1000, d: 600, h: 750 });
    expect(i.parts).toBe(4);
    expect(i.floating).toEqual(['#2 sphere (gold)']);
    expect(i.outside).toEqual(['#2 sphere (gold)', '#3 box (wood)']);
    expect(i.views.front.split('\n')[13]).toContain('#');
  });
  it('the default looks have no floating or stray parts', async () => {
    for (const type of ['sofa', 'bed', 'dining', 'chair', 'tree', 'car', 'toilet', 'wardrobe']) {
      const i = await inspectRecipe(DEFAULT_LOOKS[`furniture:${type}`], FURNITURE_TYPES[type].size);
      expect(i.floating, type).toEqual([]);
    }
  });
});
