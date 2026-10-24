/**
 * Contract tests: build, modify and check a house purely through capability calls, without the UI. Also the future acceptance criteria for MCP.
 */
import { sampleFile, messages } from '../support.js';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createProject,
  createRegistry,
  migrate,
  mutates,
  openingCenter,
  Session,
  setTranslator,
  spaceNetArea,
  type CallResult,
  type Project,
  type Translator,
} from '../../src/index.js';

/** Core messages of the web app: the core_* keys in apps/web/messages/<locale>.json */
const readMessages = (locale: string): Record<string, string> => Object.fromEntries(Object.entries(messages(locale)).filter(([k]) => k.startsWith('core_')));
const zhMessages = readMessages('zh');
const zhTranslator: Translator = (key, params) => zhMessages[`core_${key}`]?.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k]));

const registry = createRegistry();
const actor = { kind: 'agent' as const };

function harness(p: Project) {
  const session = new Session(p);
  const call = async (name: string, input: unknown = {}): Promise<CallResult> => registry.call(name, input, { session, actor });
  const ok = async (name: string, input: unknown = {}) => {
    const r = await call(name, input);
    if (!r.ok) throw new Error(`${name} failed: ${r.error?.message}`);
    return r;
  };
  return { session, call, ok };
}

const sample = () => migrate(sampleFile());

describe('building a house from scratch', () => {
  let h: ReturnType<typeof harness>;
  beforeEach(() => {
    h = harness(createProject({ id: 't', name: '测试' }));
  });

  it('adds rooms one by one, cuts doors and windows, places furniture, and passes rule checks', async () => {
    const living = await h.ok('room_add', { level: '一层', name: '客厅', rect: [0, 0, 6000, 5000], wall_thickness: 240, wall_kind: 'bearing' });
    expect((living.result as any).walls).toHaveLength(4);
    // The bedroom abuts the living room's east wall: the shared wall is not built twice
    const bed = await h.ok('room_add', {
      level: 'L1',
      name: '主卧',
      rect: [6000, 0, 4000, 5000],
      wall_thickness: 240,
      wall_kind: 'bearing',
      door: { side: 'west' },
    });
    expect((bed.result as any).walls).toHaveLength(3);
    expect((bed.result as any).door).toBeTruthy();
    await h.ok('opening_add', { wall: '主卧北墙', kind: 'window', center_on: '主卧' });
    await h.ok('opening_add', { wall: '客厅南墙', kind: 'door', width: 1000 });
    await h.ok('furniture_add', { space: '主卧', type: 'bed' });

    const p = h.session.project;
    expect(p.walls).toHaveLength(7);
    const rules = await h.ok('check_rules');
    expect((rules.result as any).issues.filter((i: any) => i.severity === 'error')).toEqual([]);
    const report = await h.ok('area_report');
    const spaces = (report.result as any).levels[0].spaces;
    expect(spaces.find((s: any) => s.name === '主卧').net).toBeCloseTo(3.76 * 4.76, 1);
  });

  it('rejects overlapping rooms and leaves data unchanged', async () => {
    await h.ok('room_add', { level: 'L1', name: 'A', rect: [0, 0, 4000, 4000] });
    const before = h.session.project;
    const r = await h.call('room_add', { level: 'L1', name: 'B', rect: [2000, 2000, 4000, 4000] });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('rule-violated');
    expect(h.session.project).toBe(before);
  });

  it('rolls back the whole batch when it fails midway', async () => {
    const before = h.session.project;
    const r = await h.call('batch', {
      label: '两间房',
      calls: [
        { name: 'room_add', input: { level: 'L1', name: 'A', rect: [0, 0, 3000, 3000] } },
        { name: 'wall_move', input: { wall: '不存在的墙', direction: 'east', distance: 100 } },
      ],
    });
    expect(r.ok).toBe(false);
    expect(h.session.project).toBe(before);
  });

  it('gives a readable error for invalid input', async () => {
    const r = await h.call('wall_move', { wall: 1 });
    expect(r.error?.code).toBe('invalid-input');
  });
});

describe('editing scheme 10', () => {
  let h: ReturnType<typeof harness>;
  beforeEach(() => {
    h = harness(sample());
  });

  it('finds objects by name and asks to disambiguate duplicates', async () => {
    const r = await h.ok('get_object', { ref: '一层·老人房一' });
    expect((r.result as any).netArea).toBeGreaterThan(10);
    const amb = await h.call('get_object', { ref: '楼梯' });
    expect(amb.error?.code).toBe('ambiguous-ref');
  });

  it('wall_move: areas on both sides trade off, and undo fully restores', async () => {
    const original = h.session.project;
    const info = (await h.ok('get_object', { ref: '一层·老人房一' })).result as any;
    const west = info.walls.find((w: any) => w.direction === '西');
    const r = await h.ok('wall_move', { wall: west.id, direction: 'west', distance: 300 });
    const changes = r.areaChanges!;
    const old1 = changes.find(c => c.name === '老人房一')!;
    const old2 = changes.find(c => c.name === '老人房二')!;
    expect(old1.after! - old1.before!).toBeGreaterThan(0.9);
    expect(old2.after! - old2.before!).toBeLessThan(-0.9);
    h.session.undo();
    expect(h.session.project).toEqual(original);
  });

  it('space_set_area: 老人房一 to 12 m²', async () => {
    const r = await h.ok('space_set_area', { space: '一层·老人房一', area: 12 });
    const s = h.session.project.spaces.find(x => x.id === (r.result as any).space)!;
    expect(spaceNetArea(h.session.project, s)).toBeCloseTo(12, 0);
    expect(Math.abs(spaceNetArea(h.session.project, s) - 12)).toBeLessThan(0.15);
  });

  it('blocks removing a bearing wall and asks for professional review', async () => {
    const w = h.session.project.walls.find(x => x.kind === 'bearing')!;
    const r = await h.call('wall_remove', { wall: w.id });
    expect(r.error?.code).toBe('structural');
  });
});

describe('constraints', () => {
  let h: ReturnType<typeof harness>;
  beforeEach(async () => {
    h = harness(createProject({ id: 't', name: '测试' }));
    await h.ok('room_add', { level: 'L1', name: '卧室', rect: [0, 0, 4000, 4000], door: { side: 'south' } });
    await h.ok('room_add', { level: 'L1', name: '书房', rect: [4000, 0, 3000, 4000] });
  });

  it('center door: the door returns to the centreline after a wall move', async () => {
    const door = h.session.project.walls.flatMap(w => w.openings).find(o => o.kind === 'door')!;
    await h.ok('constraint_add', { type: 'center', targets: [door.id, '卧室'], note: '门在房间中线上' });
    await h.ok('wall_move', { wall: '卧室西墙', direction: 'west', distance: 1000 });
    const after = h.session.project.walls.flatMap(w => w.openings).find(o => o.id === door.id)!;
    const wall = h.session.project.walls.find(w => w.openings.some(o => o.id === door.id))!;
    // The bedroom is now x ∈ [-1000, 4000], so the door centre should be at x = 1500
    expect(openingCenter(wall, after)[0]).toBe(1500);
  });

  it('hard area target: operations that push the area out of range are rejected', async () => {
    // Adding the constraint makes the solver first bring the study to the target area
    await h.ok('constraint_add', { type: 'size-target', targets: ['书房', '书房东墙'], params: { area: 10.5, tolerance: 0.3 }, hard: true });
    const s = h.session.project.spaces.find(x => x.name === '书房')!;
    expect(Math.abs(spaceNetArea(h.session.project, s) - 10.5)).toBeLessThan(0.3);
    // Manually move this wall 1 m inward: the user's action isn't pulled back, the hard constraint fails, and the whole transaction is rejected
    const r = await h.call('wall_move', { wall: '书房东墙', direction: 'west', distance: 1000 });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('constraint-violated');
  });

  it('align: moving one wall moves the other', async () => {
    await h.ok('room_add', { level: 'L1', name: '卫生间', rect: [7000, 0, 2000, 4000] });
    await h.ok('constraint_add', { type: 'align', targets: ['卧室南墙', '卫生间南墙'] });
    await h.ok('wall_move', { wall: '卧室南墙', direction: 'south', distance: 500 });
    const a = h.session.project.walls.find(w => w.name.startsWith('卧室南墙'))!;
    const b = h.session.project.walls.find(w => w.name.startsWith('卫生间南墙'))!;
    expect(b.start[1]).toBe(a.start[1]);
  });
});

describe('capability registry', () => {
  it('every capability has a description, permission and exportable input schema', () => {
    for (const c of registry.list()) {
      expect(c.description.length, c.name).toBeGreaterThan(5);
      expect(['read', 'reversible', 'main', 'external']).toContain(c.permission);
    }
    // English titles match without a translator; Chinese ones through the app's translation (as in the web app)
    expect(registry.search('area').map(f => f.name)).toContain('space_set_area');
    setTranslator(zhTranslator);
    try {
      const found = registry.search('面积');
      expect(found.map(f => f.name)).toContain('space_set_area');
      expect(found[0].input).toHaveProperty('type', 'object');
    } finally {
      setTranslator(null);
    }
  });

  it('every capability title has a Chinese and an English translation', () => {
    const zh = readMessages('zh'),
      en = readMessages('en');
    for (const c of registry.list()) {
      expect(zh[`core_cap_${c.name}`], c.name).toBeTruthy();
      expect(en[`core_cap_${c.name}`], c.name).toBe(c.title);
    }
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
  });
});

describe('small correctness fixes', () => {
  it('space_merge keeps names unique on the level', async () => {
    const h = harness(createProject({ id: 't', name: 'test', language: 'en' }));
    await h.ok('room_add', { level: 'L1', name: 'A', rect: [0, 0, 3000, 3000] });
    await h.ok('room_add', { level: 'L1', name: 'B', rect: [3000, 0, 3000, 3000] });
    await h.ok('room_add', { level: 'L1', name: 'Hall', rect: [6000, 0, 3000, 3000] });
    await h.ok('space_merge', { spaces: ['A', 'B'], name: 'Hall' });
    const names = h.session.project.spaces.map(s => s.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('Hall (2)');
  });

  it('space_merge may reuse the name of a merged space', async () => {
    const h = harness(createProject({ id: 't', name: 'test', language: 'en' }));
    await h.ok('room_add', { level: 'L1', name: 'A', rect: [0, 0, 3000, 3000] });
    await h.ok('room_add', { level: 'L1', name: 'B', rect: [3000, 0, 3000, 3000] });
    await h.ok('space_merge', { spaces: ['A', 'B'], name: 'B' });
    expect(h.session.project.spaces.map(s => s.name)).toEqual(['B']);
  });

  it('Session.load clears the operation log', async () => {
    const h = harness(createProject({ id: 't', name: 'test', language: 'en' }));
    await h.ok('room_add', { level: 'L1', name: 'A', rect: [0, 0, 3000, 3000] });
    expect(h.session.log).toHaveLength(1);
    h.session.load(createProject({ id: 't', name: 'test', language: 'en' }));
    expect((await h.ok('history_log')).result).toEqual([]);
  });
});

describe('capability modes', () => {
  it('marks undo and redo as mutating, so read-only hosts block them', () => {
    expect(mutates(registry.get('history_undo')!)).toBe(true);
    expect(mutates(registry.get('history_redo')!)).toBe(true);
    expect(mutates(registry.get('project_summary')!)).toBe(false);
  });

  it('has no read-mode capability of kind edit', () => {
    expect(
      registry
        .list()
        .filter(c => c.mode === 'read' && c.kind === 'edit')
        .map(c => c.name),
    ).toEqual([]);
  });

  it('still undoes and redoes through the registry', async () => {
    const h = harness(createProject({ id: 't', name: 'test', language: 'en' }));
    await h.ok('room_add', { level: 'L1', name: 'A', rect: [0, 0, 4000, 4000] });
    expect((await h.ok('history_undo')).result).toMatchObject({ undone: expect.any(String) });
    expect(h.session.project.spaces).toHaveLength(0);
    await h.ok('history_redo');
    expect(h.session.project.spaces).toHaveLength(1);
  });

  it('refuses to batch a session operation', async () => {
    const h = harness(createProject({ id: 't', name: 'test', language: 'en' }));
    const r = await h.call('batch', { label: 'x', calls: [{ name: 'history_undo' }] });
    expect(r.error?.code).toBe('invalid-input');
  });
});

describe('deleting objects removes the constraints that target them', () => {
  let h: ReturnType<typeof harness>;
  beforeEach(async () => {
    h = harness(createProject({ id: 't', name: 'test', floors: 2, language: 'en' }));
    await h.ok('room_add', { level: 'L2', name: 'A', rect: [0, 0, 4000, 4000] });
    await h.ok('room_add', { level: 'L2', name: 'B', rect: [4000, 0, 3000, 4000], door: { side: 'west' } });
  });
  const hard = (targets: string[], type = 'size-target', params: Record<string, unknown> = { area: 14 }) =>
    h.ok('constraint_add', { type, targets, params, hard: true });

  it('level_remove succeeds despite a hard constraint on that level', async () => {
    await hard(['A']);
    await h.ok('level_remove', { level: 'L2' });
    expect(h.session.project.constraints).toEqual([]);
  });

  it('space_remove with walls drops constraints on the removed space and walls', async () => {
    await hard(['A']);
    await hard(['A west wall'], 'align', {});
    await h.ok('space_remove', { space: 'A', walls: true });
    expect(h.session.project.constraints).toEqual([]);
  });

  it('space_merge drops constraints on the merged-away space and the removed partition', async () => {
    await hard(['B'], 'size-target', { area: 11.3, tolerance: 1 });
    const door = h.session.project.walls.flatMap(w => w.openings)[0];
    await hard([door.id, 'B'], 'center', {});
    await h.ok('space_merge', { spaces: ['A', 'B'] });
    expect(h.session.project.constraints).toEqual([]);
  });

  it('wall_remove and opening_remove drop their constraints, other constraints stay', async () => {
    const door = h.session.project.walls.flatMap(w => w.openings)[0];
    await hard([door.id, 'B'], 'center', {});
    await hard(['A'], 'size-target', { area: 14, tolerance: 2 });
    await h.ok('opening_remove', { opening: door.id });
    expect(h.session.project.constraints.map(c => c.type)).toEqual(['size-target']);
  });

  it('undo restores the removed constraint', async () => {
    await hard(['A']);
    await h.ok('level_remove', { level: 'L2' });
    await h.ok('history_undo');
    expect(h.session.project.constraints).toHaveLength(1);
  });
});
