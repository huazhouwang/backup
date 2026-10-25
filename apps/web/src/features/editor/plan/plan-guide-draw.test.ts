import { createProject, type Project } from '@plinth/core';
import { describe, expect, it } from 'vitest';
import { guideDraft, guideSources, sourceAt } from './plan-guide-draw';

const p: Project = {
  ...createProject({ id: 't', name: 't', floors: 1 }),
  walls: [{ id: 'w', name: 'w', level: 'L1', start: [0, 1000], end: [6000, 1000], thickness: 200, kind: 'bearing', openings: [] }],
};

describe('drawing guides with the tape', () => {
  it('off a wall face: a parallel guide at the offset, on a 10 mm step', () => {
    const src = sourceAt(guideSources(p, 'L1'), [3000, 1103], 20)!;
    expect(src.kind).toBe('edge');
    const g = guideDraft(src, [3500, 4704], 'L1')!;
    expect(g.distance).toBe(3600);
    expect(g.line.at[1]).toBe(1100 + 3600);
    expect(g.calls).toEqual([{ name: 'guide_add', input: { at: [3000, 4700], direction: [expect.closeTo(1), expect.closeTo(0), 0], level: 'L1' } }]);
  });

  it('off a corner: a guide along the axis the pointer follows, and a point at its end', () => {
    const src = sourceAt(guideSources(p, 'L1'), [6105, 1095], 20)!;
    expect(src).toEqual({ kind: 'corner', at: [6100, 1100] });
    const g = guideDraft(src, [6300, 3420], 'L1')!;
    expect(g.point).toEqual([6100, 3420]);
    expect(g.calls.map(c => c.input)).toEqual([
      { at: [6100, 1100], direction: 'y', level: 'L1' },
      { kind: 'point', at: [6100, 3420], level: 'L1' },
    ]);
  });

  it('off the x axis (through the origin on the house corner, 0, 900), and nothing before it has moved off', () => {
    const src = sourceAt(guideSources(p, 'L1'), [-3000, 908], 20)!;
    expect(src.kind).toBe('edge');
    expect(guideDraft(src, [-3000, 903], 'L1')).toBeNull();
    expect(guideDraft(src, [-3000, -300], 'L1')!.line.at).toEqual([-3000, -300]);
  });
});
