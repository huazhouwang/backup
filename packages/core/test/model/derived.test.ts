import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { areaReport, checkRules, createProject, createRegistry, derived, Session } from '../../src/index.js';

const build = async () => {
  const session = new Session(createProject({ id: 't', name: 'test', language: 'en' }));
  const r = createRegistry();
  await r.call('room_add', { level: 'L1', name: 'A', rect: [0, 0, 4000, 4000] }, { session, actor: { kind: 'user' } });
  return session.project;
};

describe('derived results', () => {
  it('match a fresh computation', async () => {
    const p = await build();
    expect(derived(p).rules).toEqual(checkRules(p));
    expect(derived(p).areas).toEqual(areaReport(p));
  });

  it('are computed once per project object', async () => {
    const p = await build();
    expect(derived(p).areas).toBe(derived(p).areas);
    expect(derived(p).rules).toBe(derived(p).rules);
  });

  it('are recomputed for the next project', async () => {
    const p = await build();
    const before = derived(p).areas;
    const next = produce(p, d => {
      d.spaces[0].shape = [
        {
          outer: [
            [0, 0],
            [2000, 0],
            [2000, 4000],
            [0, 4000],
          ],
        },
      ];
    });
    expect(derived(next).areas).not.toBe(before);
    expect(derived(next).areas.levels[0].spaces[0].net).toBeLessThan(before.levels[0].spaces[0].net);
  });

  it('are not cached for drafts', async () => {
    const p = await build();
    produce(p, d => {
      const a = derived(d).areas;
      d.spaces.pop();
      expect(derived(d).areas).not.toEqual(a);
    });
  });
});
