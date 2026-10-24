/** Clash detection: furniture in walls (error), furniture in the same place and elements in walls (warnings), real contacts accepted */
import { describe, expect, it } from 'vitest';
import { checkClashes, createProject, createRegistry, migrate, Session, type CallResult, type Project } from '../../src/index.js';
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

const codes = (r: CallResult) => ((r.error?.details ?? []) as { code: string }[]).map(i => i.code);

/** A 6 × 5 m room with 240 mm bearing walls on their centrelines: the inner faces are at 120 mm from each axis */
async function room() {
  const h = harness(createProject({ id: 't', name: 'test' }));
  await h.ok('room_add', { level: 'L1', name: 'Living', rect: [0, 0, 6000, 5000], wall_thickness: 240, wall_kind: 'bearing' });
  return h;
}
const issues = (h: ReturnType<typeof harness>, code: string) => checkClashes(h.session.project).filter(i => i.code === code);

describe('furniture and walls', () => {
  it('the sample has no clash', () => {
    expect(checkClashes(migrate(sampleFile()))).toEqual([]);
  });

  it('a piece standing in a wall is refused', async () => {
    const h = await room();
    // A 600 mm deep cabinet centred 200 mm from the north axis reaches 180 mm past the inner face, into the wall
    const r = await h.call('furniture_add', { level: 'L1', type: 'cabinet', position: [3000, 200], size: { w: 1000, d: 600, h: 900 } });
    expect(r.ok).toBe(false);
    expect(codes(r)).toContain('furniture-in-wall');
  });

  it('a piece against the wall face, or mounted on the wall, is fine', async () => {
    const h = await room();
    await h.ok('furniture_add', { level: 'L1', type: 'cabinet', position: [3000, 420], size: { w: 1000, d: 600, h: 900 } });
    await h.ok('furniture_add', { level: 'L1', type: 'cabinet', position: [1500, 200], size: { w: 800, d: 600, h: 400 }, elevation: 1800 });
    expect(issues(h, 'furniture-in-wall')).toEqual([]);
  });

  it('furniture against a wall, or mounted on it, moves with the wall', async () => {
    const h = await room();
    await h.ok('furniture_add', { level: 'L1', type: 'wardrobe', position: [3000, 420], size: { w: 1200, d: 600, h: 2000 } });
    await h.ok('furniture_add', { level: 'L1', type: 'cabinet', position: [1500, 300], size: { w: 800, d: 350, h: 400 }, elevation: 1800 });
    await h.ok('furniture_add', { level: 'L1', type: 'table', position: [3000, 2500], size: { w: 1200, d: 800, h: 750 } });
    const north = h.session.project.walls.find(w => w.start[1] === 0 && w.end[1] === 0)!;
    await h.ok('wall_move', { wall: north.id, direction: 'south', distance: 500 });
    const at = (type: string) => h.session.project.furniture.find(f => f.type === type)!.position;
    expect(at('wardrobe')).toEqual([3000, 920]);
    expect(at('cabinet')).toEqual([1500, 800]);
    expect(at('table')).toEqual([3000, 2500]);
    expect(issues(h, 'furniture-in-wall')).toEqual([]);
  });

  it('resizing a room carries furniture against the moved wall by exactly as much as the wall moves', async () => {
    const h = await room();
    await h.ok('room_add', { level: 'L1', name: 'Study', rect: [6000, 0, 4000, 5000], wall_thickness: 120, wall_kind: 'partition', door: { side: 'west' } });
    await h.ok('furniture_add', { level: 'L1', type: 'wardrobe', position: [6420, 3500], rotation: 90, size: { w: 1200, d: 600, h: 2000 } });
    const before = h.session.project.furniture[0].position;
    const shared = h.session.project.walls.find(w => w.start[0] === 6000 && w.end[0] === 6000)!;
    const r = await h.ok('space_set_area', { space: 'Study', area: 15, wall: shared.id });
    const moved = h.session.project.walls.find(w => w.id === shared.id)!.start[0] - 6000;
    expect(moved).not.toBe(0);
    expect(h.session.project.furniture[0].position).toEqual([before[0] + moved, before[1]]);
    expect(r.ok).toBe(true);
  });

  it('moving a piece into a wall is refused', async () => {
    const h = await room();
    await h.ok('furniture_add', { level: 'L1', type: 'cabinet', position: [3000, 2500], size: { w: 1000, d: 600, h: 900 } });
    const f = h.session.project.furniture[0];
    const r = await h.call('furniture_move', { furniture: f.id, position: [3000, 4900] });
    expect(r.ok).toBe(false);
    expect(codes(r)).toContain('furniture-in-wall');
  });
});

describe('furniture and furniture', () => {
  it('two pieces in the same place are reported', async () => {
    const h = await room();
    await h.ok('furniture_add', { level: 'L1', type: 'bed', position: [3000, 2500], size: { w: 1500, d: 2000, h: 450 } });
    const r = await h.ok('furniture_add', { level: 'L1', type: 'bed', position: [3100, 2600], size: { w: 1500, d: 2000, h: 450 } });
    expect(r.warnings?.map(w => w.code)).toContain('furniture-overlap');
  });

  it('a small piece inside a larger one, a rug under a table, or pieces at different heights are fine', async () => {
    const h = await room();
    await h.ok('furniture_add', { level: 'L1', type: 'shower', position: [1000, 1000], size: { w: 1000, d: 1000, h: 2000 } });
    await h.ok('furniture_add', { level: 'L1', type: 'stool', position: [1000, 1000], size: { w: 350, d: 350, h: 450 } });
    await h.ok('furniture_add', { level: 'L1', type: 'rug', position: [3500, 2500], size: { w: 2000, d: 1400, h: 10 } });
    await h.ok('furniture_add', { level: 'L1', type: 'table', position: [3500, 2500], size: { w: 1600, d: 900, h: 750 } });
    await h.ok('furniture_add', { level: 'L1', type: 'lamp', position: [3500, 2500], size: { w: 1500, d: 800, h: 300 }, elevation: 2000 });
    expect(issues(h, 'furniture-overlap')).toEqual([]);
  });
});

describe('elements and walls', () => {
  it('an element drawn to the wall centreline is fine; one through the wall is reported', async () => {
    const h = await room();
    // Elements are added by the plan tools and the agent through batch edits; add two drains directly
    h.session.transact('drains', { kind: 'user' }, d => {
      d.elements.push({ id: 'e1', name: 'Drain', type: 'drain', level: 'L1', params: { rect: [0, 2000, 400, 400] } });
      d.elements.push({ id: 'e2', name: 'Drain 2', type: 'drain', level: 'L1', params: { rect: [-300, 3000, 600, 400] } });
    });
    const found = issues(h, 'element-in-wall').map(i => i.targets[0]);
    expect(found).not.toContain('e1');
    expect(found).toContain('e2');
  });
});
