import { migrate, type Project } from '@plinth/core';
import { describe, expect, it } from 'vitest';
import sampleJson from '../../../../../../samples/wushi-10/project.json';
import { holdAxis, snapMeasure } from './plan-measure';

const p: Project = migrate(sampleJson);

describe('the tape measure in the plan', () => {
  it('snaps to a wall corner, else onto a wall face, else stays put', () => {
    // The north-west corner of the house: the north and west outer walls (180 thick) meet at 2120,120
    expect(snapMeasure(p, 'L1', [2035, 25], 50)).toEqual({ point: [2030, 30], snapped: 'corner' });
    // The north wall's inner face is at y = 210
    expect(snapMeasure(p, 'L1', [5000, 230], 50)).toEqual({ point: [5000, 210], snapped: 'face' });
    expect(snapMeasure(p, 'L1', [5000, 1500], 50)).toEqual({ point: [5000, 1500], snapped: null });
  });

  it('with Shift, the second point holds the first one’s horizontal or vertical line', () => {
    expect(holdAxis([0, 0], [3000, 200])).toEqual([3000, 0]);
    expect(holdAxis([0, 0], [-100, 2500])).toEqual([0, 2500]);
  });
});
