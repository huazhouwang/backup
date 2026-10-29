// Design languages (issue 217): what each space is for, the styles' finishes, and redecorating a design without moving anything
import { describe, expect, it } from 'vitest';
import {
  createRegistry,
  DEFAULT_MATERIALS,
  DEFAULT_STYLE_ID,
  migrate,
  ROOM_ROLES,
  roomRole,
  Session,
  STYLE_PRESETS,
  type Project,
  type Space,
} from '../../src/index.js';
import { sampleFile } from '../support.js';

const sample = () => migrate(sampleFile());
const space = (name: string, kind: Space['kind'] = 'indoor', extras?: Space['extras']): Space => ({
  id: 'x',
  name,
  level: 'L1',
  kind,
  shape: [],
  floor: 'oak',
  extras,
});

describe('room roles', () => {
  it('reads every space of the sample by its name and kind', () => {
    const roles = Object.fromEntries(sample().spaces.map(s => [`${s.level} ${s.name}`, roomRole(s)]));
    expect(roles).toMatchObject({
      'L1 厨房': 'kitchen',
      'L1 餐厅': 'dining',
      'L1 客厅': 'living',
      'L1 储物室': 'storage',
      'L1 浴室': 'bath',
      'L1 洗衣': 'laundry',
      'L1 楼梯': 'stair',
      'L1 厅': 'hall',
      'L1 檐廊': 'porch',
      'L1 庭院·透水砖': 'courtyard',
      'L1 玄关': 'courtyard',
      'L1 庭院·碎石': 'garden',
      'L1 神位': 'shrine',
      'L1 老人房一': 'bedroom',
      'L1 洗手台': 'bath',
      'L2 主卧': 'bedroom',
      'L2 露台': 'terrace',
      'L3 阳台': 'balcony',
      'L3 起居厅': 'hall',
      'RF 屋顶平台': 'terrace',
      'RF 出屋面楼梯间': 'stair',
    });
  });

  it('takes a recorded room type first, and English names', () => {
    expect(roomRole(space('Den', 'indoor', { room: 'master' }))).toBe('bedroom');
    expect(roomRole(space('Kitchen'))).toBe('kitchen');
    expect(roomRole(space('Front yard', 'outdoor'))).toBe('courtyard');
    expect(roomRole(space('Lawn', 'outdoor'))).toBe('garden');
    expect(roomRole(space('Anything', 'roof-terrace'))).toBe('terrace');
  });
});

describe('design languages', () => {
  it('every style finishes every role with a default material, the default style first', () => {
    expect(DEFAULT_STYLE_ID).toBe('warm-courtyard');
    for (const s of STYLE_PRESETS) {
      for (const role of ROOM_ROLES) expect(DEFAULT_MATERIALS[s.finishes.floors[role]], `${s.id} ${role}`).toBeDefined();
      expect(DEFAULT_MATERIALS[s.finishes.walls], `${s.id} walls`).toBeDefined();
      expect(DEFAULT_MATERIALS[s.finishes.accent], `${s.id} accent`).toBeDefined();
    }
  });

  it('style_apply redecorates by role and moves nothing; undo puts it back', async () => {
    const p: Project = sample();
    const session = new Session(p);
    const registry = createRegistry();
    const before = JSON.stringify({ walls: p.walls.map(w => [w.start, w.end, w.openings.length]), spaces: p.spaces.map(s => s.shape) });
    const r = await registry.call('style_apply', { style: 'warm-courtyard' }, { session, actor: { kind: 'agent' } });
    expect(r.ok).toBe(true);
    const q = session.project;
    const floorOf = (name: string) => q.spaces.find(s => s.name === name)!.floor;
    expect(floorOf('客厅')).toBe('greystone');
    expect(floorOf('主卧')).toBe('naturaloak');
    expect(floorOf('露台')).toBe('slab');
    expect(floorOf('檐廊')).toBe('deck');
    expect(floorOf('庭院·碎石')).toBe('palegravel');
    expect(q.walls.filter(w => w.kind !== 'railing').every(w => w.finish === 'limewash')).toBe(true);
    expect(q.extras?.style).toBe('warm-courtyard');
    // The design's stale copies of default materials no longer hide the style's
    expect(q.library.materials.oak).toBeUndefined();
    expect(JSON.stringify({ walls: q.walls.map(w => [w.start, w.end, w.openings.length]), spaces: q.spaces.map(s => s.shape) })).toBe(before);
    await registry.call('history_undo', {}, { session, actor: { kind: 'agent' } });
    expect(session.project.spaces.find(s => s.name === '客厅')!.floor).toBe(p.spaces.find(s => s.name === '客厅')!.floor);
    expect((await registry.call('style_apply', { style: 'nowhere' }, { session, actor: { kind: 'agent' } })).ok).toBe(false);
  });
});
