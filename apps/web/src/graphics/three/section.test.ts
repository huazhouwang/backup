import { footing, migrate, type Project } from '@plinth/core';
import { describe, expect, it } from 'vitest';
import sampleJson from '../../../../../samples/wushi-10/project.json';
import { elevationLabel, sectionAxes, sectionCuts } from './section';

const p: Project = migrate(sampleJson);

describe('section cuts', () => {
  // North to south through the living room at x = 7000, starting 1 m north of the house
  const line = { a: [7000, -1000] as [number, number], b: [7000, 15000] as [number, number] };

  it('looks across from the right-hand side of the line', () => {
    expect(sectionAxes(line)).toEqual({ d: [0, 1], n: [-1, 0] });
  });

  it('fills the walls it crosses from the ground up to their top, and the floors it crosses', () => {
    const cuts = sectionCuts(p, line);
    // The north wall (y = 120, 180 thick): 1030 to 1210 along the line, no window at x = 7000, full height
    const north = cuts.filter(c => Math.abs(c.s0 - 1030) < 1 && Math.abs(c.s1 - 1210) < 1);
    expect(north).toEqual([{ s0: 1030, s1: 1210, y0: -footing(0, p.site.groundLevel), y1: 3600 }]);
    // The second floor's slab over the living room, 120 thick at 3600
    expect(cuts.some(c => c.y1 === 3600 && c.y1 - c.y0 === 120 && c.s0 < 2000 && c.s1 > 7000)).toBe(true);
  });

  it('leaves the cut open where it passes through a window', () => {
    // Through the middle of the north wall's window from x = 7500 to 9000 (sill 900, 1500 high on the ground floor)
    const w = p.walls.find(x => x.id === 'L1-w01')!;
    const o = w.openings.find(x => Math.abs(w.start[0] + x.at - 8250) < 1)!;
    const cuts = sectionCuts(p, { a: [8250, -1000], b: [8250, 15000] }).filter(c => Math.abs(c.s0 - 1030) < 1);
    expect(cuts.map(c => [c.y0, c.y1])).toEqual([
      [-footing(0, p.site.groundLevel), o.sill],
      [o.sill + o.height, 3600],
    ]);
  });

  it('writes elevations as drawings do', () => {
    expect(elevationLabel(0)).toBe('±0.000');
    expect(elevationLabel(3600)).toBe('+3.600');
    expect(elevationLabel(-450)).toBe('-0.450');
  });
});
