/** Doors: the sliding glass door parts its two leaves into the wall, the hinged door swings; both declare that they open for the walker */
import { describe, expect, it } from 'vitest';
import { buildRecipe, lookRecipe, migrate, type BuiltPart } from '../../src/index.js';
import { sampleFile } from '../support.js';

const glass = (parts: BuiltPart[]) => parts.filter((p): p is Extract<BuiltPart, { kind: 'box' }> => p.kind === 'box' && p.mat === 'glass');

describe('the sliding glass door', () => {
  const p = migrate(sampleFile());
  const recipe = lookRecipe(p, 'opening:sliding-door')!;

  it('is its own look, not the window', () => {
    expect(recipe).toBeTruthy();
    expect(recipe).not.toBe(lookRecipe(p, 'opening:window'));
  });

  it('has two glass leaves that meet in the middle when closed and slide into the wall when open', async () => {
    const size = { w: 2400, d: 240, h: 2400 };
    const closed = glass((await buildRecipe(recipe, size, { open: 0 })).parts);
    expect(closed).toHaveLength(2);
    const xs = closed.map(g => Number(g.at[0])).sort((a, b) => a - b);
    expect(xs[0]).toBeLessThan(0);
    expect(xs[1]).toBeGreaterThan(0);
    const open = glass((await buildRecipe(recipe, size, { open: 1 })).parts);
    // Each leaf's glass is out of the doorway, beyond the frame on its side
    for (const g of open) expect(Math.abs(Number(g.at[0])) - Number(g.size[0]) / 2).toBeGreaterThan(size.w / 2 - 100);
  });
});

describe('looks that move as the walker comes near', () => {
  const p = migrate(sampleFile());

  it('declare it themselves: the sliding door and the hinged door, not the window', () => {
    expect(lookRecipe(p, 'opening:sliding-door')!.interaction?.approach).toMatchObject({ param: 'open', passable: 0.7 });
    expect(lookRecipe(p, 'opening:door')!.interaction?.approach).toMatchObject({ param: 'open' });
    expect(lookRecipe(p, 'opening:window')!.interaction).toBeUndefined();
  });

  it('the hinged door swings its leaf out of the doorway to the side it opens to', async () => {
    const recipe = lookRecipe(p, 'opening:door')!;
    const size = { w: 900, d: 240, h: 2100 };
    const leaf = async (params: Record<string, unknown>) =>
      (await buildRecipe(recipe, size, params)).parts.find(x => x.kind === 'box' && x.mat === 'wood') as Extract<BuiltPart, { kind: 'box' }>;
    const closed = await leaf({ open: 0 });
    expect(Math.abs(Number(closed.at[0]))).toBeLessThan(1);
    const right = await leaf({ open: 1, hinge: 'start', side: 'right' });
    // Swung 90° about the hinge at the start end, standing out on the right (+z) side
    expect(Number(right.at[0])).toBeCloseTo(-(900 / 2 - 50), 0);
    expect(Number(right.at[2])).toBeGreaterThan(300);
    const left = await leaf({ open: 1, hinge: 'end', side: 'left' });
    expect(Number(left.at[0])).toBeCloseTo(900 / 2 - 50, 0);
    expect(Number(left.at[2])).toBeLessThan(-300);
  });
});
