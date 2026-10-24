import { sampleFile } from '../support.js';
import { describe, expect, it } from 'vitest';
import { elementGeometry, migrate, type Element, type Project } from '../../src/index.js';

const sample: Project = migrate(sampleFile());
const el = (id: string) => sample.elements.find(e => e.id === id)!;
const bounds = (pts: [number, number][]) => {
  const xs = pts.map(p => p[0]),
    ys = pts.map(p => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

describe('element geometry', () => {
  it('a stair climbs the storey in even risers and stays inside its rectangle', () => {
    const e = el('e-stair');
    const { solids, plans } = elementGeometry(sample, e);
    const tops = solids.map(s => s.z + s.height).sort((a, b) => a - b);
    // Storey 3600: 21 risers of 171.4; the highest step is one riser below the upper floor
    const r = 3600 / 21;
    expect(tops[0]).toBeCloseTo(r);
    expect(tops[tops.length - 1]).toBeCloseTo(3600 - r);
    for (let i = 1; i < tops.length; i++) expect(tops[i] - tops[i - 1]).toBeCloseTo(r);
    const [x0, y0, x1, y1] = bounds(solids.flatMap(s => s.outline));
    const [rx, ry, rw, rh] = (e.params as { rect: number[] }).rect;
    expect(x0).toBeGreaterThanOrEqual(rx - 1e-6);
    expect(y0).toBeGreaterThanOrEqual(ry - 1e-6);
    expect(x1).toBeLessThanOrEqual(rx + rw + 1e-6);
    expect(y1).toBeLessThanOrEqual(ry + rh + 1e-6);
    // Drawn on its own level, and faintly on the level it arrives at
    expect(plans.map(p => [p.level, !!p.faint])).toEqual([
      ['L1', false],
      ['L2', true],
    ]);
  });

  it('the landing is at the far end in the climbing direction, the first flight on the side away from the turn', () => {
    const { solids } = elementGeometry(sample, el('e-stair-2'));
    const landing = solids.reduce((a, b) => (b.z + b.height > a.z + a.height && bounds(b.outline)[2] - bounds(b.outline)[0] > 2000 ? b : a));
    // Climbs north: the landing is at the north end
    expect(bounds(landing.outline)[1]).toBe(120);
    // Turns right (east): the lowest step is on the west
    const first = solids.reduce((a, b) => (b.z + b.height < a.z + a.height ? b : a));
    expect(bounds(first.outline)[2]).toBeLessThan(16200);
  });

  it('a pond is water inside a rim, a drain a grate with bars', () => {
    const pond = elementGeometry(sample, el('e-pond'));
    expect(pond.solids.map(s => s.kind).sort()).toEqual(['structure', 'water']);
    const drain = elementGeometry(sample, el('e-drain-1'));
    expect(drain.solids[0].kind).toBe('grate');
    expect(drain.plans[0].lines.length).toBeGreaterThan(10);
  });

  it('an unknown type falls back to its rectangle, so it never disappears', () => {
    const odd: Element = { id: 'x', name: 'x', type: 'mystery', level: 'L1', params: { rect: [0, 0, 1000, 500] } };
    const g = elementGeometry(sample, odd);
    expect(g.solids).toHaveLength(1);
    expect(bounds(g.solids[0].outline)).toEqual([0, 0, 1000, 500]);
  });
});
