/** Physical integrity, BIM-style: levels stack, storey walls stay under the slab above, openings stay in their wall, furniture under the ceiling */
import { describe, expect, it } from 'vitest';
import {
  checkIntegrity,
  createProject,
  createRegistry,
  heightsFromElevations,
  levelsStacked,
  migrate,
  Session,
  validate,
  type CallResult,
  type Project,
} from '../../src/index.js';
import { sampleFile } from '../support.js';

const registry = createRegistry();

function harness(p: Project) {
  const session = new Session(p);
  const call = (name: string, input: unknown = {}): Promise<CallResult> => registry.call(name, input, { session, actor: { kind: 'agent' } });
  const ok = async (name: string, input: unknown = {}) => {
    const r = await call(name, input);
    if (!r.ok) throw new Error(`${name} failed: ${r.error?.message}`);
    return r;
  };
  return { session, call, ok };
}

/** Two floors, each with the same room (so each floor has a slab over the one below), the first with a window */
async function twoFloors() {
  const h = harness(createProject({ id: 't', name: 'test', floors: 2 }));
  await h.ok('room_add', { level: 'L1', name: 'Living', rect: [0, 0, 6000, 5000], wall_thickness: 240, wall_kind: 'bearing' });
  await h.ok('room_add', { level: 'L2', name: 'Bedroom', rect: [0, 0, 6000, 5000], wall_thickness: 240, wall_kind: 'bearing' });
  const wall = h.session.project.walls.find(w => w.level === 'L1')!;
  await h.ok('opening_add', { wall: wall.id, kind: 'window', width: 1500, height: 1500, sill: 900 });
  return { h, wall };
}

const codes = (r: CallResult) => ((r.error?.details ?? []) as { code: string }[]).map(i => i.code);

describe('levels are a stack', () => {
  it('the sample migrates to stacked levels with nothing moved, and passes the integrity rules', () => {
    const p = migrate(sampleFile());
    expect(levelsStacked(p)).toBe(true);
    expect(p.levels.map(l => l.elevation)).toEqual([0, 3600, 6900, 10200]);
    expect(validate(p)).toEqual([]);
    expect(checkIntegrity(p)).toEqual([]);
  });

  it('storey heights are derived from elevations for older data, so no level moves', () => {
    const levels = heightsFromElevations([
      { id: 'L1', name: '1', elevation: 0, height: 3000 },
      { id: 'L2', name: '2', elevation: 3300, height: 3000 },
      { id: 'RF', name: 'roof', elevation: 6000, height: 0, roof: true },
    ]);
    expect(levels.map(l => [l.elevation, l.height])).toEqual([
      [0, 3300],
      [3300, 2700],
      [6000, 0],
    ]);
  });

  it('validation reports levels that do not stack', () => {
    const p = createProject({ id: 't', name: 'test', floors: 2 });
    p.levels[1].elevation += 100;
    expect(validate(p).some(i => i.path === 'levels')).toBe(true);
  });

  it('changing a storey height moves the levels above it', async () => {
    const h = harness(createProject({ id: 't', name: 'test', floors: 3 }));
    await h.ok('level_update', { level: 'L2', height: 3600 });
    const p = h.session.project;
    expect(p.levels.map(l => [l.id, l.elevation])).toEqual([
      ['L1', 0],
      ['L2', 3000],
      ['L3', 6600],
      ['RF', 9600],
    ]);
    expect(levelsStacked(p)).toBe(true);
  });

  it('renames a level, and refuses a storey height for the roof', async () => {
    const h = harness(createProject({ id: 't', name: 'test' }));
    await h.ok('level_update', { level: 'L1', name: 'Ground' });
    expect(h.session.project.levels[0].name).toBe('Ground');
    const r = await h.call('level_update', { level: 'RF', height: 3000 });
    expect(r.ok).toBe(false);
  });

  it('a lower storey that would leave a window above its wall is refused', async () => {
    const { h } = await twoFloors();
    const r = await h.call('level_update', { level: 'L1', height: 2200 });
    expect(r.ok).toBe(false);
    expect(codes(r)).toContain('opening-above-wall');
    expect(h.session.project.levels[0].height).toBe(3000);
  });
});

describe('storey walls stay under the slab above', () => {
  it('a bearing wall taller than its storey under a slab is refused', async () => {
    const { h, wall } = await twoFloors();
    const r = await h.call('wall_update', { wall: wall.id, height: 3500 });
    expect(r.ok).toBe(false);
    expect(codes(r)).toContain('wall-through-slab');
  });

  it('a lower partition, and a tall fence, are fine', async () => {
    const { h, wall } = await twoFloors();
    await h.ok('wall_update', { wall: wall.id, height: 2400 });
    await h.ok('wall_add', { level: 'L1', start: [-2000, 7000], end: [8000, 7000], thickness: 120, kind: 'fence', height: 2000 });
    expect(checkIntegrity(h.session.project)).toEqual([]);
  });

  it('a tall wall is fine where the floor above is open (double height)', async () => {
    const { h, wall } = await twoFloors();
    await h.ok('space_update', { space: 'Bedroom', kind: 'void' });
    await h.ok('wall_update', { wall: wall.id, height: 4000 });
    expect(h.session.project.walls.find(w => w.id === wall.id)?.height).toBe(4000);
  });
});

describe('openings are hosted by their wall', () => {
  it('a window reaching above its wall is refused', async () => {
    const { h, wall } = await twoFloors();
    const r = await h.call('opening_add', { wall: wall.id, kind: 'window', width: 900, height: 1500, sill: 2000, at: 4500 });
    expect(r.ok).toBe(false);
    expect(codes(r)).toContain('opening-above-wall');
  });

  it('a gate may be taller than its fence', async () => {
    const h = harness(createProject({ id: 't', name: 'test' }));
    await h.ok('wall_add', { level: 'L1', start: [0, 0], end: [8000, 0], thickness: 120, kind: 'fence', height: 1800 });
    const fence = h.session.project.walls[0];
    await h.ok('opening_add', { wall: fence.id, kind: 'gate', width: 1500, height: 2400 });
    expect(checkIntegrity(h.session.project)).toEqual([]);
  });
});

describe('furniture fits under the ceiling', () => {
  it('a piece taller than the clear height under a slab is refused, a fitting one is fine', async () => {
    const { h } = await twoFloors();
    const tall = await h.call('furniture_add', { space: 'Living', type: 'wardrobe', size: { w: 1200, d: 600, h: 2950 } });
    expect(tall.ok).toBe(false);
    expect(codes(tall)).toContain('furniture-above-ceiling');
    await h.ok('furniture_add', { space: 'Living', type: 'wardrobe', size: { w: 1200, d: 600, h: 2400 } });
  });

  it('on the top floor under the roof without a slab, there is no ceiling to hit', async () => {
    const h = harness(createProject({ id: 't', name: 'test' }));
    await h.ok('room_add', { level: 'L1', name: 'Hall', rect: [0, 0, 6000, 5000], wall_thickness: 240, wall_kind: 'bearing' });
    await h.ok('furniture_add', { space: 'Hall', type: 'wardrobe', size: { w: 1200, d: 600, h: 2950 } });
    expect(checkIntegrity(h.session.project)).toEqual([]);
  });
});
