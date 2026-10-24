import { migrate, type Project } from '@plinth/core';
import { describe, expect, it } from 'vitest';
import sampleJson from '../../../../../../samples/wushi-10/project.json';
import { dragCall, draggable } from './plan-drag';

const p: Project = migrate(sampleJson);
const wall = (name: string) => p.walls.find(w => w.name === name)!;
/** A north-south wall between two rooms of the sample (data, so in the project's language) */
const EAST_WALL = '老人房二东墙'; // i18n-ok: sample data name
/** Snapping distance used below: 100 mm (about 8 px at a typical zoom) */
const TOL = 100;

describe('dragging in the plan', () => {
  it('walls, openings and furniture can be dragged; rooms and elements cannot', () => {
    expect(draggable(p, wall(EAST_WALL).id)).toBe(true);
    expect(draggable(p, p.furniture[0].id)).toBe(true);
    expect(draggable(p, p.spaces[0].id)).toBe(false);
    expect(draggable(p, 'e-stair')).toBe(false);
  });

  it('a wall moves perpendicular to itself in 50 mm steps', () => {
    const w = wall(EAST_WALL);
    // North-south wall: only the x part of the drag counts
    const r = dragCall(p, w.id, [-487, 300], TOL)!;
    expect(r.name).toBe('wall_move');
    expect(r.input).toEqual({ wall: w.id, direction: 'west', distance: 500 });
    expect(r.readout).toBe('0.50 m');
    expect(dragCall(p, w.id, [10, 0], TOL)).toBeNull();
  });

  it('a wall snaps to the line of a parallel wall nearby, and shows a guide', () => {
    const w = wall(EAST_WALL);
    const other = p.walls.find(o => o.id !== w.id && o.level === 'L1' && o.start[0] === o.end[0] && Math.abs(o.start[0] - w.start[0]) > 300)!;
    const want = other.start[0] - w.start[0];
    const r = dragCall(p, w.id, [want + 60, 0], TOL)!;
    expect(Math.abs(r.input.distance as number)).toBe(Math.abs(want));
    expect(r.guides).toHaveLength(1);
  });

  it('a door or window snaps to the middle of its wall', () => {
    const w = p.walls.find(x => x.level === 'L1' && x.openings.length === 1 && x.openings[0].width < 1500)!;
    const o = w.openings[0];
    const len = Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1]);
    const d = [(w.end[0] - w.start[0]) / len, (w.end[1] - w.start[1]) / len];
    const by = len / 2 - o.at + 40;
    const r = dragCall(p, o.id, [d[0] * by, d[1] * by], TOL);
    if (Math.abs(len / 2 - o.at) < 1) return expect(r).toBeNull();
    expect(r!.input).toEqual({ opening: o.id, at: Math.round(len / 2) });
    expect(r!.guides).toHaveLength(1);
  });

  it('furniture pushed near a wall lands against its face', () => {
    const f = p.furniture.find(x => x.level === 'L1' && x.rotation === 0)!;
    const west = f.position[0] - f.size.w / 2;
    // The nearest north-south wall face to the west of the furniture
    const faces = p.walls
      .filter(w => w.level === 'L1' && w.start[0] === w.end[0] && (w.kind === 'bearing' || w.kind === 'partition'))
      .filter(w => Math.min(w.start[1], w.end[1]) < f.position[1] && Math.max(w.start[1], w.end[1]) > f.position[1])
      .map(w => w.start[0] + w.thickness / 2)
      .filter(x => x <= west + 1)
      .sort((a, b) => b - a);
    const face = faces[0];
    const r = dragCall(p, f.id, [face - west + 70, 0], TOL)!;
    expect((r.input.position as number[])[0] - f.size.w / 2).toBe(face);
  });
});
