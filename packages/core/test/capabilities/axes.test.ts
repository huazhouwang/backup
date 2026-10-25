/** The model axes: the origin defaults to the house's top-left corner, moves through axes_set and resets; axes are copied as guides */
import { describe, expect, it } from 'vitest';
import { axesOrigin, createProject, createRegistry, houseCorner, migrate, Session, type CallResult } from '../../src/index.js';
import { sampleFile } from '../support.js';

const registry = createRegistry();

function harness(p = migrate(sampleFile())) {
  const session = new Session(p);
  const call = (name: string, input: unknown = {}): Promise<CallResult> => registry.call(name, input, { session, actor: { kind: 'agent' } });
  return { session, call };
}

describe('axes', () => {
  it("the origin sits on the house's top-left corner until moved", () => {
    const p = migrate(sampleFile());
    // The sample's north-west outer corner
    expect(houseCorner(p)).toEqual([2030, 30]);
    expect(axesOrigin(p)).toEqual([2030, 30]);
    expect(houseCorner(createProject({ id: 't', name: 't', floors: 1 }))).toEqual([0, 0]);
  });

  it('moves, undoes and resets', async () => {
    const h = harness();
    expect((await h.call('axes_set', { origin: [1000.4, 2000] })).ok).toBe(true);
    expect(h.session.project.axes).toEqual({ origin: [1000, 2000] });
    expect(axesOrigin(h.session.project)).toEqual([1000, 2000]);
    h.session.undo();
    expect(h.session.project.axes).toBeUndefined();
    await h.call('axes_set', { origin: [5, 5] });
    await h.call('axes_set', { reset: true });
    expect(h.session.project.axes).toBeUndefined();
  });

  it('copies an axis as a guide named after it, then slides and turns it', async () => {
    const h = harness();
    const a = await h.call('guide_add', { axis: 'x' });
    await h.call('guide_add', { axis: 'x' });
    const z = await h.call('guide_add', { axis: 'z' });
    const [x1, x2, z1] = h.session.project.guides;
    expect(x1).toMatchObject({ name: 'x₁', axis: 'x', kind: 'line', at: [2030, 30, 0], dir: [1, 0, 0] });
    expect(x2.name).toBe('x₂');
    expect(z1).toMatchObject({ name: 'z₁', axis: 'z', dir: [0, 0, 1] });
    await h.call('guide_move', { guide: (a.result as { id: string }).id, by: [0, 1500], direction: [1, 1, 0] });
    expect(h.session.project.guides[0].at).toEqual([2030, 1530, 0]);
    expect(h.session.project.guides[0].dir![0]).toBeCloseTo(Math.SQRT1_2);
    await h.call('guide_move', { guide: (z.result as { id: string }).id, direction: [0.5, 0, 0.866] });
    expect(h.session.project.guides[2].dir![2]).toBeCloseTo(0.866, 2);
  });

  it('turned axes from v11 keep only their origin', () => {
    const doc = { ...sampleFile(), version: 11, axes: { origin: [100, 200], angle: 30 } };
    expect(migrate(doc).axes).toEqual({ origin: [100, 200] });
  });
});
