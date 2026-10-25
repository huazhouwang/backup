/** Guides: drawn, moved and removed through capabilities, undoable, found by name, and left alone by the rule checks */
import { describe, expect, it } from 'vitest';
import { checkRules, createProject, createRegistry, findObject, migrate, Session, type CallResult } from '../../src/index.js';
import { sampleFile } from '../support.js';

const registry = createRegistry();

function harness() {
  const session = new Session(createProject({ id: 't', name: 'test', floors: 2 }));
  const call = (name: string, input: unknown = {}): Promise<CallResult> => registry.call(name, input, { session, actor: { kind: 'agent' } });
  return { session, call };
}

describe('guides', () => {
  it('a line along an axis through a plan point, at a height above a level', async () => {
    const h = harness();
    const r = await h.call('guide_add', { at: [0, 3600], direction: 'x' });
    expect(r.ok).toBe(true);
    const sill = await h.call('guide_add', { at: [1000, 0], direction: 'y', level: 'L2', height: 900 });
    const [a, b] = h.session.project.guides;
    expect(a).toMatchObject({ kind: 'line', at: [0, 3600, 0], dir: [1, 0, 0], name: '参考线1' }); // i18n-ok: project data name
    expect(b).toMatchObject({ at: [1000, 0, 3000 + 900], dir: [0, 1, 0], name: '参考线2' }); // i18n-ok: project data name
    expect(findObject(h.session.project, (sill.result as { id: string }).id)?.kind).toBe('guide');
  });

  it('moves, removes by name, clears, and undoes like any edit', async () => {
    const h = harness();
    await h.call('guide_add', { at: [0, 3600] });
    await h.call('guide_add', { kind: 'point', at: [500, 500] });
    expect(h.session.project.guides[1].dir).toBeUndefined();
    await h.call('guide_move', { guide: '参考线1', by: [0, 600] }); // i18n-ok: project data name
    expect(h.session.project.guides[0].at).toEqual([0, 4200, 0]);
    await h.call('guide_remove', { guides: ['参考线2'] }); // i18n-ok: project data name
    expect(h.session.project.guides).toHaveLength(1);
    await h.call('guide_remove', { all: true });
    expect(h.session.project.guides).toEqual([]);
    h.session.undo();
    expect(h.session.project.guides).toHaveLength(1);
  });

  it('a line needs a direction', async () => {
    const h = harness();
    expect((await h.call('guide_add', { at: [0, 0], direction: [0, 0, 0] })).ok).toBe(false);
  });

  it('older projects load with no guides, and the rule checks ignore guides', async () => {
    const p = migrate(sampleFile());
    expect(p.guides).toEqual([]);
    const h = harness();
    const before = checkRules(h.session.project).length;
    await h.call('guide_add', { at: [0, 0], direction: 'y' });
    expect(checkRules(h.session.project)).toHaveLength(before);
  });

  it('copies of the model axes from v12 stay as plain guides, and the axes go', () => {
    const doc = { ...migrate(sampleFile()), version: 12, axes: { origin: [100, 200] } } as any;
    doc.guides = [{ id: 'g1', name: 'x₁', kind: 'line', at: [100, 200, 0], dir: [1, 0, 0], axis: 'x' }];
    const p = migrate(doc) as any;
    expect(p.axes).toBeUndefined();
    expect(p.guides).toEqual([{ id: 'g1', name: 'x₁', kind: 'line', at: [100, 200, 0], dir: [1, 0, 0] }]);
  });
});
