/** The model axes: moved and turned through axes_set, undoable, reset; the frame helpers convert to and from them */
import { describe, expect, it } from 'vitest';
import { axesOf, createProject, createRegistry, customAxes, fromAxes, migrate, Session, toAxes, type CallResult } from '../../src/index.js';
import { sampleFile } from '../support.js';

const registry = createRegistry();

function harness() {
  const session = new Session(createProject({ id: 't', name: 'test', floors: 1 }));
  const call = (name: string, input: unknown = {}): Promise<CallResult> => registry.call(name, input, { session, actor: { kind: 'agent' } });
  return { session, call };
}

describe('axes', () => {
  it('the world axes until moved', () => {
    const p = createProject({ id: 't', name: 'test', floors: 1 });
    expect(customAxes(p)).toBe(false);
    expect(axesOf(p)).toMatchObject({ origin: [0, 0], x: [1, 0], y: [0, 1] });
  });

  it('moves, turns, undoes and resets', async () => {
    const h = harness();
    expect((await h.call('axes_set', { origin: [1000.4, 2000] })).ok).toBe(true);
    expect(h.session.project.axes).toEqual({ origin: [1000, 2000], angle: 0 });
    await h.call('axes_set', { angle: -30 });
    expect(h.session.project.axes).toEqual({ origin: [1000, 2000], angle: 330 });
    h.session.undo();
    expect(h.session.project.axes?.angle).toBe(0);
    await h.call('axes_set', { reset: true });
    expect(h.session.project.axes).toBeUndefined();
    // Back on the world axes is no axes at all
    await h.call('axes_set', { origin: [5, 5] });
    await h.call('axes_set', { origin: [0, 0] });
    expect(h.session.project.axes).toBeUndefined();
  });

  it('converts points to and from the axes (clockwise on the plan, y south)', () => {
    const f = axesOf({ axes: { origin: [1000, 0], angle: 90 } });
    // Red turned a quarter clockwise points south; green then points west
    expect(f.x).toEqual([0, 1]);
    expect(f.y).toEqual([-1, 0]);
    expect(toAxes(f, [1000, 500])).toEqual([500, 0]);
    const q = fromAxes(f, toAxes(f, [1234, -567]));
    expect(q[0]).toBeCloseTo(1234);
    expect(q[1]).toBeCloseTo(-567);
  });

  it('older projects load with the world axes', () => {
    const p = migrate(sampleFile());
    expect(p.axes).toBeUndefined();
  });
});
