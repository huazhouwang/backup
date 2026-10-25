import { axesFrame, createProject, type Project } from '@plinth/core';
import { describe, expect, it } from 'vitest';
import { alignToWall, axesDrag, inAxes } from './plan-axes';
import { holdAxis } from './plan-measure';
import { guideDraft, guideSources, sourceAt } from './plan-guide-draw';
import { placeCall } from './plan-place';
import { dragCall } from './plan-drag';

const base = createProject({ id: 't', name: 't', floors: 1 });
// A wall turned 30° clockwise on the plan, 4 m long, from 1000,1000
const r = Math.PI / 6;
const end: [number, number] = [1000 + 4000 * Math.cos(r), 1000 + 4000 * Math.sin(r)];
const p: Project = {
  ...base,
  walls: [{ id: 'w', name: 'w', level: 'L1', start: [1000, 1000], end, thickness: 200, kind: 'bearing', openings: [] }],
  axes: { origin: [1000, 1000], angle: 30 },
};
const f = axesFrame(p.axes);

describe('the model axes in the plan', () => {
  it('the origin drags and snaps to a corner, the knob turns in 15° steps', () => {
    const moved = axesDrag(p, 'L1', axesFrame(), 'origin', [0, 0], [503, 497], 20);
    expect(moved).toMatchObject({ kind: 'axes', call: { input: { origin: [500, 500] } }, snapped: false });
    // The wall's outer corner at its start
    const corner = guideSources(p, 'L1').corners[2];
    const snapped = axesDrag(p, 'L1', axesFrame(), 'origin', [0, 0], [corner[0] + 5, corner[1] - 5], 20);
    expect(snapped).toMatchObject({ kind: 'axes', snapped: true, call: { input: { origin: [Math.round(corner[0]), Math.round(corner[1])] } } });
    const turned = axesDrag(p, 'L1', axesFrame(), 'turn', [1000, 0], [1000, 1100], 20);
    expect(turned).toMatchObject({ kind: 'axes', call: { input: { angle: 45 } }, readout: '45°' });
    expect(axesDrag(p, 'L1', axesFrame(), 'turn', [1000, 0], [1000, 30], 20)).toBeNull();
  });

  it('dragging an axis draws a guide parallel to it', () => {
    const d = axesDrag(p, 'L1', f, 'x', [3000, 2155], [2500, 3500], 20);
    expect(d?.kind).toBe('guide');
    const g = d?.kind === 'guide' ? d.draft : null;
    expect(g!.line.dir[0]).toBeCloseTo(f.x[0]);
    expect(g!.line.dir[1]).toBeCloseTo(f.x[1]);
  });

  it('aligns red to a wall, keeping the nearest of its square directions', () => {
    expect(alignToWall(p.walls[0], 0)).toBe(30);
    expect(alignToWall(p.walls[0], 100)).toBe(120);
  });

  it('the tape and guides off a corner follow the turned axes', () => {
    const q = holdAxis([1000, 1000], [3000, 2200], f);
    // On red through the first point: 30° below east
    expect((q[1] - 1000) / (q[0] - 1000)).toBeCloseTo(Math.tan(r));
    const src = sourceAt(guideSources(p, 'L1'), [1000, 1000], 5)!;
    expect(src.kind).toBe('corner');
    const g = guideDraft(src, [1000 - 1000 * Math.sin(r), 1000 + 1000 * Math.cos(r)], 'L1', f)!;
    expect(g.line.dir).toEqual(f.y);
    expect(g.distance).toBe(1000);
  });

  it('furniture is placed turned with the axes and pushed out of a turned wall', () => {
    const local = inAxes(p, f);
    expect(local.walls[0].start).toEqual([0, 0]);
    expect(local.walls[0].end[1]).toBeCloseTo(0);
    // Just south of the wall's middle along green
    const at: [number, number] = [1000 + 2000 * Math.cos(r) - 200 * Math.sin(r), 1000 + 2000 * Math.sin(r) + 200 * Math.cos(r)];
    const placed = placeCall(
      { ...p, library: { ...p.library, furniture: { box: { name: 'box', size: { w: 600, d: 600, h: 500 } } as never } } },
      'L1',
      { kind: 'furniture', type: 'box' },
      at,
      1,
    );
    expect(placed!.input.rotation).toBe(30);
    const back = inAxes({ ...p, furniture: [{ position: placed!.input.position } as never] }, f).furniture[0].position;
    // Its back on the wall's face: half the wall and half its depth from the centreline
    expect(back[1]).toBeCloseTo(100 + 300, -1);
  });

  it('dragged furniture snaps to a turned wall face', () => {
    const q = (u: number, v: number): [number, number] => [1000 + u * f.x[0] + v * f.y[0], 1000 + u * f.x[1] + v * f.y[1]];
    const pp: Project = {
      ...p,
      furniture: [{ id: 'f', name: 'f', level: 'L1', type: 'box', position: q(2000, 500), rotation: 30, size: { w: 600, d: 600, h: 500 } } as never],
    };
    const res = dragCall(pp, 'f', [-90 * f.y[0], -90 * f.y[1]], 30);
    const local = inAxes({ ...pp, furniture: [{ ...pp.furniture[0], position: res!.input.position as [number, number] }] }, f).furniture[0].position;
    expect(local[1]).toBeCloseTo(400, -1);
  });
});
