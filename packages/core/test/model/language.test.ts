/** Project language (names written into data) and core UI text (translated by the app, English fallback). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createProject, createRegistry, migrate, SCHEMA_VERSION, Session, setTranslator, text, validate } from '../../src/index.js';

const registry = createRegistry();
const actor = { kind: 'agent' as const };

afterEach(() => setTranslator(null));

describe('project language', () => {
  it('an English project gets English level, catalog, wall and opening names', async () => {
    const p = createProject({ id: 't', name: 'Test', floors: 2, language: 'en' });
    expect(p.language).toBe('en');
    expect(p.levels.map(l => l.name)).toEqual(['Level 1', 'Level 2', 'Roof']);
    expect(p.library.furniture.bed.name).toBe('Bed');
    expect(p.library.furniture.bed.group).toBe('Bedroom');
    expect(p.library.materials).toEqual({});
    expect(validate(p)).toEqual([]);

    const session = new Session(p);
    const room = await registry.call(
      'room_add',
      { level: 'Level 1', name: 'Living room', rect: [0, 0, 6000, 5000], door: { side: 'south' } },
      { session, actor },
    );
    expect(room.ok, room.error?.message).toBe(true);
    const names = session.project.walls.map(w => w.name);
    expect(names).toContain('Living room north wall');
    expect(names).toContain('Living room south wall');
    expect((room.result as any).door.name).toBe('Living room south wall·Door');
    // English references with the level prefix resolve too
    const r = await registry.call('opening_add', { wall: 'Level 1·Living room north wall', kind: 'window' }, { session, actor });
    expect(r.ok, r.error?.message).toBe(true);
    const info = await registry.call('get_object', { ref: 'Living room' }, { session, actor });
    expect((info.result as any).walls.map((w: any) => w.direction).sort()).toEqual(['East', 'North', 'South', 'West']);
  });

  it('a Chinese project (the default) keeps Chinese names', () => {
    const p = createProject({ id: 't', name: '测试' });
    expect(p.language).toBe('zh');
    expect(p.levels.map(l => l.name)).toEqual(['一层', '屋顶']);
    expect(p.library.furniture.bed.name).toBe('床');
  });

  it('a v1 project migrates to language zh', () => {
    const v1 = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/wushi-10-v1.json'), 'utf8'));
    expect(v1.version).toBe(1);
    expect(v1.language).toBeUndefined();
    const p = migrate(v1);
    expect(p.version).toBe(SCHEMA_VERSION);
    expect(p.language).toBe('zh');
    expect(validate(p)).toEqual([]);
  });

  it('the legacy stair migrates to one U-shaped stair per storey', () => {
    const v1 = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/wushi-10-v1.json'), 'utf8'));
    const p = migrate(v1);
    const stairs = p.elements.filter(e => e.type === 'stair');
    expect(stairs.map(e => [e.id, e.name, e.level, e.topLevel])).toEqual([
      ['e-stair', '楼梯·一层', 'L1', 'L2'],
      ['e-stair-2', '楼梯·二层', 'L2', 'L3'],
      ['e-stair-3', '楼梯·三层', 'L3', 'RF'],
    ]);
    expect(p.elements.some(e => e.type === 'legacy-stair')).toBe(false);
    expect('legacy-stair' in p.library.elements).toBe(false);
    expect(validate(p)).toEqual([]);
  });
});

describe('core text', () => {
  it('returns the English fallback with parameters when no translator is installed', () => {
    expect(text('err_not_found', 'Cannot find {kind} “{ref}”', { kind: 'wall', ref: 'X' })).toBe('Cannot find wall “X”');
  });

  it('uses the installed translator, and the fallback for keys it does not know', () => {
    setTranslator((key, params) => (key === 'greet' ? `你好 ${params.name}` : undefined));
    expect(text('greet', 'Hello {name}', { name: 'A' })).toBe('你好 A');
    expect(text('other', 'Other')).toBe('Other');
  });

  it('errors from capabilities come through the translator', async () => {
    const session = new Session(createProject({ id: 't', name: '测试' }));
    const en = await registry.call('wall_move', { wall: 'nowhere', direction: 'east', distance: 100 }, { session, actor });
    expect(en.error?.message).toMatch(/^Cannot find wall/);
    setTranslator((key, params) => (key === 'err_not_found' ? `找不到${params.kind}“${params.ref}”` : key === 'err_kind_wall' ? '墙' : undefined));
    const zh = await registry.call('wall_move', { wall: 'nowhere', direction: 'east', distance: 100 }, { session, actor });
    expect(zh.error?.message).toBe('找不到墙“nowhere”');
  });
});
