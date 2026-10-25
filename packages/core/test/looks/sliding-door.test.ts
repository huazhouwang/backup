/** The sliding glass door: two glass leaves that part into the wall as it opens */
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
