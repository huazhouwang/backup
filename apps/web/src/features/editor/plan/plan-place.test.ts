import { migrate, type Project } from '@plinth/core';
import { describe, expect, it } from 'vitest';
import sampleJson from '../../../../../../samples/wushi-10/project.json';
import { rotateCall, rotateHandle } from './plan-drag';
import { placeCall } from './plan-place';

const p: Project = migrate(sampleJson);
const wall = (id: string) => p.walls.find(w => w.id === id)!;

describe('placing from the palette', () => {
  it('furniture goes down at its default size on a 50 mm step, pushed out of a wall it would stand in', () => {
    const size = p.library.furniture.armchair.size;
    const r = placeCall(p, 'L1', { kind: 'furniture', type: 'armchair' }, [6012, 2038], 100)!;
    expect(r.name).toBe('furniture_add');
    expect(r.input).toEqual({ level: 'L1', type: 'armchair', position: [6000, 2050] });
    // Just inside the north wall (y = 120, 180 thick): pushed south until it clears the wall's face
    const near = placeCall(p, 'L1', { kind: 'furniture', type: 'armchair' }, [6000, 200], 100)!;
    expect((near.input.position as number[])[1]).toBe(120 + 90 + size.d / 2);
  });

  it('a window goes onto the nearest storey wall, snapped to its middle; nothing when no wall is near', () => {
    const north = wall('L1-w01');
    const r = placeCall(p, 'L1', { kind: 'opening', opening: 'window' }, [7120, 300], 100)!;
    expect(r.name).toBe('opening_add');
    expect(r.input).toEqual({ wall: north.id, kind: 'window', at: 5000 });
    const mid = placeCall(p, 'L1', { kind: 'opening', opening: 'window' }, [2120 + 7630 + 40, 150], 100)!;
    expect(mid.input.at).toBe(7630);
    expect(placeCall(p, 'L1', { kind: 'opening', opening: 'window' }, [6000, 2500], 100)).toBeNull();
  });

  it('a gate goes in a fence, not a house wall', () => {
    const r = placeCall(p, 'L1', { kind: 'opening', opening: 'gate' }, [5000, 13200], 100)!;
    expect(wall(r.input.wall as string).kind).toBe('fence');
  });
});

describe('turning furniture with its handle', () => {
  it('points its back edge at the pointer, in 15° steps', () => {
    const f = p.furniture.find(x => x.level === 'L1')!;
    const [x, y] = f.position;
    expect(rotateCall(p, f.id, [x, y - 1000])!.input).toEqual({ furniture: f.id, rotation: 0 });
    expect(rotateCall(p, f.id, [x + 1000, y])!.input.rotation).toBe(90);
    expect(rotateCall(p, f.id, [x - 1000, y + 30])!.input.rotation).toBe(270);
    expect(rotateCall(p, f.id, [x + 1000, y - 1100])!.input.rotation).toBe(45);
    const h = rotateHandle({ ...p, furniture: [{ ...f, rotation: 0 }] }, f.id, 300)!;
    expect(h.handle).toEqual([x, y - f.size.d / 2 - 300]);
  });
});
