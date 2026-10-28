import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createEngine } from '@opensu/sandbox';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EFFECT_LIMITS, findWidget, fitEffects, migrate, runWidget, setScriptSandbox, validateWidgetOutput, type WidgetItem } from '../../src/index.js';
import { sampleFile } from '../support.js';

const require = createRequire(import.meta.url);
const wasm = await WebAssembly.compile(readFileSync(require.resolve('@jitl/quickjs-wasmfile-release-sync/wasm')));
const sample = () => migrate(sampleFile());
const BUILTIN = { origin: 'builtin' as const, id: 'builtin-widgets' };
const ctx = (level: string) => ({ level, view: '3d' as const, language: 'zh' as const });
const run = async (id: string, params: Record<string, unknown>) => {
  const p = sample();
  const r = await runWidget(BUILTIN, id, findWidget('builtin-widgets', id)!.def, p, params as never, ctx(p.levels[0].id));
  if (!r.ok) throw new Error(r.error.message);
  return { p, items: r.items };
};
const rain = (count: number): WidgetItem => ({
  type: 'particles',
  outline: [
    [0, 0],
    [1000, 0],
    [1000, 1000],
  ],
  from: 0,
  to: 3000,
  count,
  fall: 9,
  size: 300,
  shape: 'streak',
  tone: 'water',
});

describe('effect items', () => {
  it('are validated: known shapes and tones, heights in order, counts and lights within limits', () => {
    expect(validateWidgetOutput([rain(100), { type: 'sky', mood: 'night' }, { type: 'fog', density: 0.3, tone: 'mist' }], {})).toHaveLength(3);
    const bad: unknown[] = [
      [{ ...rain(100), tone: 'red' }],
      [{ ...rain(100), from: 3000, to: 0 }],
      [rain(EFFECT_LIMITS.particles + 1)],
      [{ ...rain(100), color: '#ff0000' }],
      Array.from({ length: EFFECT_LIMITS.lights + 1 }, () => ({ type: 'light', at: [0, 0], z: 2400, intensity: 1, range: 5000, tone: 'warm' })),
    ];
    for (const b of bad) expect(() => validateWidgetOutput(b, {})).toThrow();
  });

  it('fit the budget: particles scaled down together to the total, and by the density the host lowers', () => {
    const items = [rain(EFFECT_LIMITS.particles), rain(EFFECT_LIMITS.particles), rain(EFFECT_LIMITS.particles)];
    const fitted = fitEffects(items);
    expect(fitted.particles.reduce((n, p) => n + p.count, 0)).toBeLessThanOrEqual(EFFECT_LIMITS.totalParticles);
    expect(fitEffects(items, 0.5).particles[0].count).toBe(Math.floor(fitted.particles[0].count / 2));
    expect(fitEffects([rain(100)]).particles[0].count).toBe(100);
  });

  it('take the darkest sky and the thickest fog of several', () => {
    const f = fitEffects([
      { type: 'sky', mood: 'night' },
      { type: 'sky', mood: 'dusk' },
      { type: 'fog', density: 0.2, tone: 'mist' },
      { type: 'fog', density: 0.6, tone: 'mist' },
      { type: 'fog', density: 0.1, tone: 'mist' },
    ]);
    expect(f.sky?.mood).toBe('night');
    expect(f.fog?.density).toBe(0.6);
  });
});

describe('built-in effects', () => {
  beforeEach(() => setScriptSandbox(createEngine(wasm)));
  afterEach(() => setScriptSandbox(null));

  it('rain falls over the courtyard asked for, by part of its name, under an overcast sky', async () => {
    const { p, items } = await run('rain', { space: '庭院', intensity: 0.6, wind: 1 });
    const drops = items.find(i => i.type === 'particles')!;
    const yard = p.spaces.find(s => s.name === '庭院·透水砖')!;
    expect(drops).toMatchObject({ shape: 'streak', tone: 'water', level: yard.level, outline: yard.shape[0].outer });
    expect(items.some(i => i.type === 'sky' && i.mood === 'overcast')).toBe(true);
    // Heavier rain: more drops, faster
    const heavy = (await run('rain', { space: '庭院', intensity: 1, wind: 1 })).items.find(i => i.type === 'particles')!;
    expect(heavy.type === 'particles' && drops.type === 'particles' && heavy.count > drops.count && heavy.fall > drops.fall).toBe(true);
  });

  it('rain without a space covers the whole site', async () => {
    const { p, items } = await run('rain', { space: '', intensity: 0.5, wind: 0 });
    expect(items.find(i => i.type === 'particles')).toMatchObject({ outline: p.site.boundary });
  });

  it('snow, fog, fireflies and night declare their effects', async () => {
    expect((await run('snow', { space: '', intensity: 0.5, wind: 0 })).items.find(i => i.type === 'particles')).toMatchObject({ shape: 'flake', tone: 'snow' });
    expect((await run('fog', { density: 0.5 })).items).toEqual([{ type: 'fog', density: 0.5, tone: 'mist' }]);
    expect((await run('fireflies', { space: '庭院', intensity: 0.5 })).items.find(i => i.type === 'particles')).toMatchObject({ shape: 'glow', fall: 0 });
    const night = (await run('night', { brightness: 0.7 })).items;
    expect(night[0]).toEqual({ type: 'sky', mood: 'night' });
    expect(night.filter(i => i.type === 'light').length).toBe(EFFECT_LIMITS.lights);
  });
});
