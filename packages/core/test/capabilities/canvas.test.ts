import { describe, expect, it } from 'vitest';
import {
  canvasPageSchema,
  createProject,
  createRegistry,
  migrate,
  parseWidgetLibrary,
  putCanvasModule,
  removeCanvasModule,
  SCHEMA_VERSION,
  Session,
  setCanvasData,
  type CanvasHost,
} from '../../src/index.js';
import { sampleFile } from '../support.js';

const registry = createRegistry();
const SOURCE = "export default function (canvas) { canvas.view.layer('x'); }";

describe("the design's canvas page modules", () => {
  const setup = (host?: CanvasHost) => {
    const session = new Session(createProject({ id: 'p', name: '测试' }));
    const call = (name: string, input: unknown) => registry.call(name, input, { session, actor: { kind: 'agent' }, host: host ? { canvas: host } : undefined });
    return { session, call };
  };

  it('saves, replaces (version up), lists, keeps data and removes modules, through undo', async () => {
    const { session, call } = setup();
    expect((await call('canvas_module_put', { id: 'grid', name: '轴网', source: SOURCE })).result).toEqual({ id: 'grid', version: 1, tried: false });
    expect((await call('canvas_module_put', { id: 'grid', name: '轴网', source: SOURCE + '\n' })).result).toMatchObject({ version: 2 });
    expect((await call('canvas_data_set', { module: 'grid', data: { lines: [{ name: 'A' }] } })).ok).toBe(true);
    expect((await call('canvas_modules', {})).result).toEqual([
      { id: 'grid', name: '轴网', description: undefined, version: 2, bytes: SOURCE.length + 1, hasData: true },
    ]);
    expect((await call('canvas_data_set', { module: 'nope', data: 1 })).error?.code).toBe('not-found');
    await call('canvas_module_remove', { id: 'grid' });
    expect(session.project.canvas).toEqual({ modules: [] });
    await call('history_undo', {});
    expect(session.project.canvas?.data).toEqual({ grid: { lines: [{ name: 'A' }] } });
  });

  it('tries a module in the open page first: one that throws comes back as the error and is not saved', async () => {
    const tried: string[] = [];
    const host: CanvasHost = {
      tryModule: async (id, source) => (tried.push(id), source.includes('throw') ? { ok: false, error: 'TypeError: boom' } : { ok: true, tried: true }),
    };
    const { session, call } = setup(host);
    const bad = await call('canvas_module_put', { id: 'bad', name: 'x', source: "export default () => { throw new TypeError('boom') }" });
    expect(bad.error?.message).toMatch(/failed in the canvas page: TypeError: boom/);
    expect(session.project.canvas).toBeUndefined();
    expect((await call('canvas_module_put', { id: 'good', name: 'x', source: SOURCE })).result).toMatchObject({ tried: true });
    expect(tried).toEqual(['bad', 'good']);
  });

  it('refuses bad ids and oversized data', async () => {
    const { call } = setup();
    expect((await call('canvas_module_put', { id: 'Bad Id', name: 'x', source: SOURCE })).error?.code).toBe('invalid-input');
    await call('canvas_module_put', { id: 'm', name: 'x', source: SOURCE });
    expect((await call('canvas_data_set', { module: 'm', data: 'x'.repeat(200001) })).error?.code).toBe('invalid-input');
  });

  it('v18 keeps older designs as they are', () => {
    const p = migrate({ ...sampleFile(), version: 17 });
    expect(p.version).toBe(SCHEMA_VERSION);
    expect(p.canvas).toBeUndefined();
  });
});

describe("a person's own canvas page (kept in their settings)", () => {
  it('adds, versions, keeps data for and removes modules, and validates what is stored', () => {
    let { page } = putCanvasModule(undefined, { id: 'mine', name: '我的', source: SOURCE });
    ({ page } = putCanvasModule(page, { id: 'mine', name: '我的', source: SOURCE + ' ' }));
    expect(page.modules).toHaveLength(1);
    expect(page.modules[0].version).toBe(2);
    page = setCanvasData(page, 'mine', { n: 1 });
    expect(canvasPageSchema.safeParse(page).success).toBe(true);
    expect(() => setCanvasData(page, 'other', 1)).toThrow();
    page = removeCanvasModule(page, 'mine');
    expect(page).toEqual({ modules: [] });
    expect(canvasPageSchema.safeParse({ modules: [{ id: 'Bad id', name: 'x', source: 'x', version: 1 }] }).success).toBe(false);
  });
});

describe('canvas modules published as wheels', () => {
  it('a library file keeps them, and a design keeps where its copy came from', async () => {
    const lib = parseWidgetLibrary({
      format: 'plinth-widgets',
      formatVersion: 1,
      id: 'mine',
      name: { zh: '我的' },
      version: '1.0.0',
      widgets: {},
      canvasModules: { grid: { name: '轴网', source: SOURCE, version: 2 } },
    });
    expect(lib.canvasModules?.grid.version).toBe(2);
    expect(() => parseWidgetLibrary({ ...lib, canvasModules: { grid: { name: '轴网', source: SOURCE, version: 0 } } })).toThrow();

    const session = new Session(createProject({ id: 'p', name: '测试' }));
    const origin = { library: 'mine', module: 'grid', version: 2 };
    const r = await registry.call('canvas_module_put', { id: 'grid', name: '轴网', source: SOURCE, origin }, { session, actor: { kind: 'agent' } });
    expect(r.ok).toBe(true);
    expect(session.project.canvas?.modules[0].origin).toEqual(origin);
  });
});
