import { createRegistry, migrate, Session } from '@plinth/core';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyDiff, diffProject, isEmptyDiff } from './protocol';

const sample = () => migrate(JSON.parse(readFileSync(new URL('../../../../samples/wushi-10/project.json', import.meta.url), 'utf8')));

describe('design changes across the bridge', () => {
  it('sends nothing when nothing changed, and only the changed items when one did', async () => {
    const s = new Session(sample());
    const before = s.project;
    expect(isEmptyDiff(diffProject(before, before))).toBe(true);
    const wall = before.walls[0];
    await createRegistry().call('wall_update', { wall: wall.id, thickness: wall.thickness + 10 }, { session: s, actor: { kind: 'user' } });
    const d = diffProject(before, s.project);
    expect(Object.keys(d.lists)).toContain('walls');
    expect(d.lists.walls.upsert.map(w => w.id)).toContain(wall.id);
    expect(d.lists.walls.upsert.length).toBeLessThan(before.walls.length);
    expect(JSON.stringify(applyDiff(before, d))).toBe(JSON.stringify(s.project));
  });

  it('adds, removes and reorders items, and replaces plain fields', () => {
    const p = sample();
    const [a, b, c] = p.furniture;
    const q = { ...p, name: 'renamed', furniture: [c, a, { ...b, id: 'new-f' }] };
    const d = diffProject(p, q);
    expect(d.set).toEqual({ name: 'renamed' });
    expect(d.lists.furniture.remove).toEqual(p.furniture.filter(f => f !== a && f !== c).map(f => f.id));
    expect(d.lists.furniture.order).toEqual([c.id, a.id, 'new-f']);
    expect(JSON.stringify(applyDiff(p, d))).toBe(JSON.stringify(q));
  });
});
