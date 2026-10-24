/** Stairs climb through slab openings, openings are guarded, bearing walls stand on bearing walls, floors don't reach far out */
import { describe, expect, it } from 'vitest';
import { checkStructure, createProject, createRegistry, migrate, Session, type CallResult, type Project } from '../../src/index.js';
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
  /** Edits the capabilities don't cover (elements, slab openings), made directly */
  const edit = (fn: (d: Project) => void) => session.transact('edit', { kind: 'user' }, fn);
  return { session, call, ok, edit };
}

const codes = (h: ReturnType<typeof harness>) => checkStructure(h.session.project).map(i => i.code);

/** Two floors with the same 6 × 5 m room of bearing walls */
async function house() {
  const h = harness(createProject({ id: 't', name: 'test', floors: 2 }));
  await h.ok('room_add', { level: 'L1', name: 'Living', rect: [0, 0, 6000, 5000], wall_thickness: 240, wall_kind: 'bearing' });
  await h.ok('room_add', { level: 'L2', name: 'Bedroom', rect: [0, 0, 6000, 5000], wall_thickness: 240, wall_kind: 'bearing' });
  return h;
}

const stair = {
  id: 'st',
  name: 'Stair',
  type: 'stair',
  level: 'L1',
  topLevel: 'L2',
  params: { rect: [3500, 500, 2300, 2500], up: 'south', turn: 'left', gap: 100 },
};

describe('the sample', () => {
  it('has no error, and its warnings are the bearing walls standing partly on a partition or the slab', () => {
    const issues = checkStructure(migrate(sampleFile()));
    expect(issues.filter(i => i.severity === 'error')).toEqual([]);
    expect(new Set(issues.map(i => i.code))).toEqual(new Set(['bearing-unsupported']));
  });
});

describe('stairs and openings', () => {
  it('a stair needs an opening in the floor it reaches: without one the change is refused', async () => {
    const h = await house();
    const refused = h.edit(d => void d.elements.push(structuredClone(stair) as Project['elements'][number]));
    expect(refused.ok).toBe(false);
    expect((refused.error as { issues?: { code: string }[] }).issues?.map(i => i.code)).toContain('stair-no-opening');
    h.edit(
      d =>
        void d.spaces.push({
          id: 'well',
          name: 'Stairwell',
          level: 'L2',
          kind: 'void',
          floor: 'concrete',
          shape: [
            {
              outer: [
                [3400, 400],
                [5880, 400],
                [5880, 3100],
                [3400, 3100],
              ],
            },
          ],
        }),
    );
    expect(h.edit(d => void d.elements.push(structuredClone(stair) as Project['elements'][number])).ok).toBe(true);
    expect(codes(h)).not.toContain('stair-no-opening');
  });

  it('an opening in the floor with nothing around it is reported; walls around it guard it', async () => {
    const h = await house();
    h.edit(
      d =>
        void d.spaces.push({
          id: 'void',
          name: 'Void',
          level: 'L2',
          kind: 'void',
          floor: 'concrete',
          shape: [
            {
              outer: [
                [1000, 1000],
                [3000, 1000],
                [3000, 3000],
                [1000, 3000],
              ],
            },
          ],
        }),
    );
    expect(codes(h)).toContain('opening-unguarded');
    await h.ok('wall_add', { level: 'L2', start: [1000, 1000], end: [3000, 1000], thickness: 60, kind: 'railing' });
    await h.ok('wall_add', { level: 'L2', start: [3000, 1000], end: [3000, 3000], thickness: 60, kind: 'railing' });
    await h.ok('wall_add', { level: 'L2', start: [1000, 3000], end: [1000, 1000], thickness: 60, kind: 'railing' });
    expect(codes(h)).not.toContain('opening-unguarded');
  });
});

describe('structure, as rules of thumb', () => {
  it('stacked bearing walls are fine; a bearing wall over nothing is reported', async () => {
    const h = await house();
    expect(codes(h)).toEqual([]);
    await h.ok('wall_add', { level: 'L2', start: [3000, 120], end: [3000, 4880], thickness: 180, kind: 'bearing' });
    expect(codes(h)).toContain('bearing-unsupported');
  });

  it('a floor reaching far beyond the storey below is reported; a balcony is not', async () => {
    const h = await house();
    await h.ok('room_add', { level: 'L2', name: 'Balcony', rect: [0, 5000, 6000, 1200], wall_thickness: 120, wall_kind: 'partition' });
    expect(codes(h)).not.toContain('cantilever');
    await h.ok('room_add', { level: 'L2', name: 'Studio', rect: [6000, 0, 3000, 5000], wall_thickness: 120, wall_kind: 'partition' });
    expect(codes(h)).toContain('cantilever');
  });
});
