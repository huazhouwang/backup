import { describe, expect, it } from 'vitest';
import { migrate, roofs } from '../../src/index.js';
import { sampleFile } from '../support.js';

const loadSample = () => migrate(sampleFile());

describe('roofs', () => {
  it('covers the stair penthouse on the roof at the top of its walls, and nothing else in the sample', () => {
    const p = loadSample();
    const r = roofs(p);
    expect(r.map(x => x.space)).toEqual(['RF-s02']);
    expect(r[0].top).toBe(2800);
  });

  it('covers the part of a room the floor above leaves open', () => {
    const p = loadSample();
    // Take away the second floor's slabs: the first floor's indoor rooms are under the sky
    p.spaces = p.spaces.filter(s => s.level !== 'L2');
    const r = roofs(p).filter(x => x.level === 'L1');
    expect(r.length).toBeGreaterThan(0);
    expect(r.every(x => x.top === 3600)).toBe(true);
  });
});
