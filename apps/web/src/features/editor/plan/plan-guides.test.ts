import { createProject, type Project } from '@plinth/core';
import { describe, expect, it } from 'vitest';
import { clipLine, planGuideLines, planGuidePoints, snapToGuides } from './plan-guides';

const p: Project = {
  ...createProject({ id: 't', name: 't', floors: 1 }),
  guides: [
    { id: 'g01', name: 'a', kind: 'line', at: [0, 3600, 0], dir: [1, 0, 0] },
    { id: 'g02', name: 'b', kind: 'line', at: [2000, 0, 0], dir: [0, 1, 0] },
    { id: 'g03', name: 'c', kind: 'line', at: [500, 500, 0], dir: [0, 0, 1] },
    { id: 'g04', name: 'd', kind: 'point', at: [-1000, -1000, 900] },
  ],
};

describe('guides on the plan', () => {
  it('level lines show as lines, points and lines straight up as points', () => {
    expect(planGuideLines(p).map(l => l.id)).toEqual(['g01', 'g02']);
    expect(planGuidePoints(p).map(g => g.id)).toEqual(['g03', 'g04']);
  });

  it('snaps to a crossing or a point first, else onto a line', () => {
    expect(snapToGuides(p, [2030, 3580], 50)).toEqual({ point: [2000, 3600], snapped: 'corner' });
    expect(snapToGuides(p, [510, 480], 50)).toEqual({ point: [500, 500], snapped: 'corner' });
    expect(snapToGuides(p, [800, 3630], 50)).toEqual({ point: [800, 3600], snapped: 'face' });
    expect(snapToGuides(p, [800, 2000], 50)).toBeNull();
  });

  it('draws a line across a frame', () => {
    expect(clipLine(planGuideLines(p)[0], [-500, 0, 10000, 8000])).toEqual([
      [-500, 3600],
      [9500, 3600],
    ]);
    expect(clipLine(planGuideLines(p)[0], [0, 5000, 100, 100])).toBeNull();
  });
});
