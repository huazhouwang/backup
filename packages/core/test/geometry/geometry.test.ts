import { describe, expect, it } from 'vitest';
import { furnitureFootprint, rect, ringArea, sharedLength, wallBody, wallSpaceSegments, wallSpaceSpan, type Space, type Wall } from '../../src/index.js';

const wall = (start: [number, number], end: [number, number], o: Partial<Wall> = {}): Wall => ({
  id: 'w',
  name: 'w',
  level: 'L1',
  start,
  end,
  thickness: 200,
  kind: 'partition',
  openings: [],
  ...o,
});
const space = (...shape: Space['shape']): Space => ({ id: 's', name: 's', level: 'L1', kind: 'indoor', shape, floor: 'oak' });

describe('wall / space overlap', () => {
  const w = wall([0, 0], [4000, 0]);

  it('measures where a wall runs along a space boundary', () => {
    const s = space(rect(1000, 0, 3000, 2000));
    expect(wallSpaceSegments(w, s)).toEqual([[1000, 3000]]);
    expect(sharedLength(w, s)).toBe(2000);
    expect(wallSpaceSpan(w, s)).toEqual([1000, 3000]);
  });

  it('clamps to the wall and ignores boundary edges that lie beyond its ends', () => {
    // Two parts: one along the middle of the wall, the other entirely past its end on the same line
    const s = space(rect(1000, 0, 2000, 2000), rect(6000, 0, 7000, 2000));
    expect(wallSpaceSpan(w, s)).toEqual([1000, 2000]);
    expect(wallSpaceSpan(w, space(rect(3000, 0, 5000, 2000)))).toEqual([3000, 4000]);
  });

  it('returns null when they do not meet', () => {
    expect(wallSpaceSpan(w, space(rect(0, 500, 4000, 2000)))).toBeNull();
    expect(sharedLength(w, space(rect(0, 500, 4000, 2000)))).toBe(0);
  });
});

describe('footprints', () => {
  it('extends bearing walls and partitions by half their thickness, but not fences', () => {
    expect(ringArea(wallBody(wall([0, 0], [4000, 0])).outer)).toBeCloseTo(4200 * 200);
    expect(ringArea(wallBody(wall([0, 0], [4000, 0], { kind: 'fence' })).outer)).toBeCloseTo(4000 * 200);
  });

  it('rotates furniture about its centre', () => {
    const f = { id: 'f', name: 'f', type: 'bed', level: 'L1', position: [0, 0] as [number, number], rotation: 90, size: { w: 2000, d: 1000, h: 500 } };
    const xs = furnitureFootprint(f).outer.map(p => Math.round(p[0])),
      ys = furnitureFootprint(f).outer.map(p => Math.round(p[1]));
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([-500, 500, -1000, 1000]);
  });
});
