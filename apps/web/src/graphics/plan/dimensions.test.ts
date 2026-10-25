import { createProject, migrate, type Project } from '@plinth/core';
import { describe, expect, it } from 'vitest';
import sampleJson from '../../../../../samples/wushi-10/project.json';
import { elevationDimensions, elevationText, exteriorDimensions, heightDimensions, selectionDimensions, type DimChain } from './dimensions';
import { levelShapes } from './plan-geometry';

const p: Project = migrate(sampleJson);
const STEP = 600;
const chains = (q: Project, level: string, size = 100) => exteriorDimensions(q, level, levelShapes(q, level).bounds, { size, step: STEP });
const side = (cs: DimChain[], normal: [number, number]) =>
  cs.filter(c => c.normal[0] === normal[0] && c.normal[1] === normal[1]).map(c => c.marks.map(Math.round));

describe('exterior dimension chains', () => {
  it('a plain room: axes and overall size on each side, no detail chain without openings', () => {
    const q = createProject({ id: 't', name: 't' });
    const t = 240;
    const wall = (id: string, start: [number, number], end: [number, number]) => ({
      id,
      name: id,
      level: 'L1',
      start,
      end,
      thickness: t,
      kind: 'bearing' as const,
      openings: [],
    });
    q.walls = [wall('n', [0, 0], [6000, 0]), wall('e', [6000, 0], [6000, 4000]), wall('s', [6000, 4000], [0, 4000]), wall('w', [0, 4000], [0, 0])];
    const cs = chains(q, 'L1');
    expect(side(cs, [0, -1])).toEqual([
      [0, 6000],
      [-120, 6120],
    ]);
    expect(side(cs, [1, 0])).toEqual([
      [0, 4000],
      [-120, 4120],
    ]);
    // A window in the north wall adds the detail chain on that side only
    q.walls[0].openings = [{ id: 'o', name: 'o', kind: 'window', at: 2000, width: 1500, height: 1500, sill: 900 }];
    expect(side(chains(q, 'L1'), [0, -1])[0]).toEqual([0, 1250, 2750, 6000]);
    expect(side(chains(q, 'L1'), [0, 1])).toHaveLength(2);
  });

  it('the sample: axes of the walls meeting each façade, overall to the outer faces, the courtyard as a site line', () => {
    const cs = chains(p, 'L1');
    const north = side(cs, [0, -1]);
    // Detail, axes, overall
    expect(north).toHaveLength(3);
    expect(north[1]).toEqual([2120, 9580, 12900, 14900, 17380]);
    expect(north[2]).toEqual([2030, 17470]);
    const south = side(cs, [0, 1]);
    expect(south[1]).toEqual([2120, 4600, 9580, 14120, 17380]);
    // West: the house (to 10490) and the courtyard behind its fences (to 13400)
    const west = side(cs, [-1, 0]);
    expect(west.at(-2)).toEqual([30, 10490]);
    expect(west.at(-1)).toEqual([30, 13400]);
  });

  it('at a small scale (large values), crowded detail chains are left out; axes and overall stay', () => {
    const north = side(chains(p, 'L1', 400), [0, -1]);
    expect(north).toEqual([
      [2120, 9580, 12900, 14900, 17380],
      [2030, 17470],
    ]);
  });

  it('chains sit outside the drawing, farther out in order', () => {
    const [, , , y1] = levelShapes(p, 'L1').bounds;
    const south = chains(p, 'L1').filter(c => c.normal[1] === 1);
    expect(south.map(c => c.origin[1])).toEqual(south.map((_, k) => y1 + STEP * (1.5 + k)));
  });
});

describe('temporary dimensions', () => {
  it('a wall: its length, on the side away from its room', () => {
    const [c] = selectionDimensions(p, ['L1-w01'], STEP);
    expect(c.marks).toEqual([0, 15260]);
    // The north wall's dimension is north of it, outside the house
    expect(c.origin[1]).toBeLessThan(120);
  });

  it('a window: its width and distances to the wall ends', () => {
    const w = p.walls.find(x => x.openings.length > 0)!;
    const o = w.openings[0];
    const [c] = selectionDimensions(p, [o.id], STEP);
    expect(c.marks[0]).toBe(0);
    expect(c.marks).toContain(o.at - o.width / 2);
    expect(c.marks).toContain(o.at + o.width / 2);
  });

  it('furniture: distances to the nearest wall across x and across y', () => {
    const f = p.furniture.find(x => x.level === 'L1' && !x.elevation)!;
    const cs = selectionDimensions(p, [f.id], STEP);
    expect(cs.length).toBeGreaterThan(0);
    for (const c of cs) expect(c.marks[1]).toBeGreaterThan(0);
  });
});

describe('vertical dimensions for 3D', () => {
  const all = p.levels.map(l => l.id);

  it('storeys, overall from the grade, and the sills and heads in the façade', () => {
    const d = heightDimensions(p, all, 'bottom');
    const [detail, storeys, overall] = d.chains;
    // The sample's storeys: 3600, 3300, 3300 up to the roof at 10.2 m; the stair housing on the roof tops out at 13 m
    expect(storeys).toEqual([0, 3600, 6900, 10200, 13000]);
    expect(overall).toEqual([-200, 13000]);
    // The south façade's ground-floor windows: sill 900, head 2400 (and the sliding door's head)
    expect(detail).toEqual(expect.arrayContaining([0, 900, 2400, 3600]));
    expect(detail.length).toBeGreaterThan(storeys.length);
    expect(d.levels.map(l => l.at)).toEqual([0, 3600, 6900, 10200]);
    expect(d.grade).toBe(-200);
  });

  it('only the levels shown (the cutaway), up to the top of their walls', () => {
    const d = heightDimensions(p, ['L1', 'L2'], 'bottom');
    expect(d.chains.at(-2)).toEqual([0, 3600, 6900]);
    expect(d.chains.at(-1)).toEqual([-200, 6900]);
  });

  it('writes elevations as drawings do', () => {
    expect([elevationText(0), elevationText(3600), elevationText(-200)]).toEqual(['±0.000', '3.600', '-0.200']);
  });
});

describe('vertical dimensions on the south elevation', () => {
  const all = p.levels.map(l => l.id);

  it("stand on the right side chains' lines, heights pointing down, crowded chains left out", () => {
    const fine = elevationDimensions(p, all, 0, { size: 100, step: 260 });
    expect(fine.chains.map(c => c.origin[0])).toEqual([390, 650, 910].slice(0, fine.chains.length));
    const storeys = fine.chains.find(c => c.marks.length === 5)!;
    expect(storeys.marks).toEqual([-13000, -10200, -6900, -3600, 0]);
    expect(fine.chains.at(-1)!.marks).toEqual([-13000, 200]);
    expect(fine.top).toBe(13000);
    // At a large type size the detail chain no longer fits and is dropped; the overall height always stays
    const coarse = elevationDimensions(p, all, 0, { size: 600, step: 1560 });
    expect(coarse.chains.length).toBeLessThan(fine.chains.length);
    expect(coarse.chains.at(-1)!.marks).toEqual([-13000, 200]);
  });
});
