import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createEngine } from '@plinth/sandbox';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BUILTIN_WIDGET_LIBRARIES,
  createProject,
  createRegistry,
  findWidget,
  migrate,
  parseWidgetLibrary,
  realmKey,
  registerWidgetLibrary,
  runWidget,
  scriptKey,
  Session,
  setScriptSandbox,
  unregisterWidgetLibrary,
  validateWidgetOutput,
  widgetParams,
  type ScriptSandbox,
  type WidgetContext,
  type WidgetDef,
  type WidgetLibrary,
} from '../../src/index.js';
import { sampleFile } from '../support.js';

const require = createRequire(import.meta.url);
const wasm = await WebAssembly.compile(readFileSync(require.resolve('@jitl/quickjs-wasmfile-release-sync/wasm')));
const sample = () => migrate(sampleFile());
const ctx = (level: string): WidgetContext => ({ level, view: 'plan', language: 'zh' });
const BUILTIN = { origin: 'builtin' as const, id: 'builtin-widgets' };
const grid = findWidget('builtin-widgets', 'grid')!.def;

const library = (id: string, widgets: Record<string, WidgetDef>): WidgetLibrary => ({
  format: 'plinth-widgets',
  formatVersion: 1,
  id,
  name: { en: id },
  version: '1.0.0',
  widgets,
});
const def = (script: string, params: WidgetDef['params'] = {}): WidgetDef => ({
  name: { en: 'test' },
  version: '1.0.0',
  description: 'test',
  permissions: ['draw'],
  params,
  script,
});

describe('widget library files', () => {
  it('parses the built-in library, with the grid', () => {
    expect(BUILTIN_WIDGET_LIBRARIES.map(l => l.id)).toEqual(['builtin-widgets']);
    expect(Object.keys(BUILTIN_WIDGET_LIBRARIES[0].widgets)).toEqual(['grid', 'axes']);
    expect(grid.name).toEqual({ zh: '轴网', en: 'Grid' });
    expect(Object.keys(grid.params!)).toEqual(['spacing', 'originX', 'originY', 'snap']);
  });

  it('refuses a malformed library', () => {
    expect(() => parseWidgetLibrary({ format: 'plinth-looks', formatVersion: 1, id: 'x', name: { en: 'x' }, version: '1.0.0', widgets: {} })).toThrow(/format/);
    expect(() => parseWidgetLibrary({ ...library('x', {}), widgets: { a: { ...def('x'), permissions: ['delete'] } } })).toThrow(/permissions/);
    expect(() => parseWidgetLibrary({ ...library('x', {}), widgets: { a: def('x', { n: { type: 'number', default: 'no' } }) } })).toThrow();
  });
});

describe('params and output', () => {
  it('fills defaults and refuses unknown or out-of-range values', () => {
    expect(widgetParams(grid, { spacing: 6000 })).toEqual({ spacing: 6000, originX: null, originY: null, snap: true });
    expect(() => widgetParams(grid, { spacing: 10 })).toThrow(/at least 300/);
    expect(() => widgetParams(grid, { nope: 1 })).toThrow(/unknown parameter nope/);
  });

  it('accepts the known items and drops the whole output for one bad item', () => {
    const ok = [
      { type: 'line', from: [0, 0], to: [1000, 0], dash: [6, 3] },
      { type: 'label', at: [0, 0], text: 'A' },
      { type: 'point', at: [1, 2], level: 'L1' },
      {
        type: 'area',
        outline: [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
      },
      { type: 'handle', at: [0, 0], x: 'originX', y: 'originY' },
      { type: 'snap', at: [0, 0] },
    ];
    expect(validateWidgetOutput(ok, grid)).toHaveLength(6);
    const bad = [
      [...ok, { type: 'html', html: '<b>' }],
      [{ type: 'line', from: [0, Number.NaN], to: [1, 1] }],
      [{ type: 'point', at: [1e9, 0] }],
      [{ type: 'label', at: [0, 0], text: 'x'.repeat(500) }],
      [{ type: 'point', at: [0, 0], color: 'red' }],
      Array.from({ length: 6000 }, () => ({ type: 'snap', at: [0, 0] })),
      [{ type: 'handle', at: [0, 0], x: 'snap', y: 'originY' }],
      [{ type: 'handle', at: [0, 0], x: 'missing', y: 'originY' }],
      { items: ok },
    ];
    for (const b of bad) expect(() => validateWidgetOutput(b, grid)).toThrow();
  });
});

describe('running widgets', () => {
  beforeEach(() => setScriptSandbox(createEngine(wasm)));
  afterEach(() => setScriptSandbox(null));

  it('draws the coordinate system: two axes with ticks, x and y, the origin handle', async () => {
    const p = sample();
    const axes = findWidget('builtin-widgets', 'axes')!.def;
    const r = await runWidget(BUILTIN, 'axes', axes, p, { length: 3000, tick: 1000 }, ctx(p.levels[0].id));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items.filter(i => i.type === 'label').map(i => (i as { text: string }).text)).toEqual(['x', 'y']);
    expect(r.items.filter(i => i.type === 'handle')).toHaveLength(1);
    // Origin and two ticks on each axis
    expect(r.items.filter(i => i.type === 'snap')).toHaveLength(5);
  });

  it('draws the grid over the sample: axes, labels, the origin handle and snaps', async () => {
    const p = sample();
    const r = await runWidget(BUILTIN, 'grid', grid, p, { spacing: 3600 }, ctx(p.levels[0].id));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const lines = r.items.filter(i => i.type === 'line');
    const snaps = r.items.filter(i => i.type === 'snap');
    expect(lines.length).toBeGreaterThan(4);
    expect(r.items.filter(i => i.type === 'label').map(i => (i as { text: string }).text)).toContain('A');
    expect(r.items.filter(i => i.type === 'handle')).toHaveLength(1);
    expect(snaps.length).toBeGreaterThan(4);
    // No snaps when switched off; another origin moves the handle
    const off = await runWidget(BUILTIN, 'grid', grid, p, { snap: false, originX: 0, originY: 0 }, ctx(p.levels[0].id));
    expect(off.ok && off.items.some(i => i.type === 'snap')).toBe(false);
    expect(off.ok && off.items.find(i => i.type === 'handle')).toMatchObject({ at: [0, 0] });
  });

  it('caches by project, script, params and context', async () => {
    const p = sample();
    const a = runWidget(BUILTIN, 'grid', grid, p, {}, ctx(p.levels[0].id));
    expect(runWidget(BUILTIN, 'grid', grid, p, {}, ctx(p.levels[0].id))).toBe(a);
    expect(runWidget(BUILTIN, 'grid', grid, p, { spacing: 6000 }, ctx(p.levels[0].id))).not.toBe(a);
    expect(runWidget(BUILTIN, 'grid', grid, { ...p }, {}, ctx(p.levels[0].id))).not.toBe(a);
  });

  it('reports script errors, invalid output and bad params, without throwing', async () => {
    const p = createProject({ id: 't', name: 't' });
    const lib = { origin: 'user' as const, owner: 'u1', id: 'mine' };
    expect(await runWidget(lib, 'boom', def('function widget() { throw new Error("no") }'), p, {}, ctx('L1'))).toMatchObject({
      ok: false,
      error: { kind: 'script' },
    });
    expect(await runWidget(lib, 'bad', def('function widget() { return [{ type: "html" }] }'), p, {}, ctx('L1'))).toMatchObject({
      ok: false,
      error: { kind: 'invalid' },
    });
    expect(await runWidget(lib, 'spin', def('function widget() { for (;;) {} }'), p, {}, ctx('L1'))).toMatchObject({ ok: false, error: { kind: 'timeout' } });
    expect(await runWidget(BUILTIN, 'grid', grid, p, { spacing: 1 }, ctx('L1'))).toMatchObject({ ok: false, error: { kind: 'invalid' } });
  });

  it('reports a missing sandbox as unavailable, and does not keep that result', async () => {
    setScriptSandbox(null);
    const p = sample();
    expect(await runWidget(BUILTIN, 'grid', grid, p, {}, ctx(p.levels[0].id))).toMatchObject({ ok: false, error: { kind: 'unavailable' } });
    setScriptSandbox(createEngine(wasm));
    expect((await runWidget(BUILTIN, 'grid', grid, p, {}, ctx(p.levels[0].id))).ok).toBe(true);
  });
});

describe('isolation policy', () => {
  afterEach(() => setScriptSandbox(null));

  it('a realm per library, a script per definition, one script for every use of a definition', async () => {
    const calls: { realm: string; script: string }[] = [];
    const spy: ScriptSandbox = {
      realm: realm => ({
        script: async script => {
          calls.push({ realm, script });
          return { setData: async () => {}, call: async () => [] };
        },
      }),
    };
    setScriptSandbox(spy);
    const p = createProject({ id: 't', name: 't' });
    const a = def('function widget() { return [] }'),
      b = def('function widget() { return [1].slice(1) }');
    const user = { origin: 'user' as const, owner: 'u1', id: 'mine' },
      team = { origin: 'team' as const, owner: 't1', id: 'ours' };
    await runWidget(user, 'a', a, p, {}, ctx('L1'));
    await runWidget(user, 'b', b, p, {}, ctx('L1'));
    await runWidget(user, 'a', a, p, {}, ctx('L2'));
    await runWidget(team, 'a', a, p, {}, ctx('L1'));
    expect(new Set(calls.map(c => c.realm))).toEqual(new Set([realmKey(user), realmKey(team)]));
    expect(realmKey(BUILTIN)).toBe('builtin:builtin-widgets');
    expect(realmKey(user)).toBe('user:u1:mine');
    const userScripts = new Set(calls.filter(c => c.realm === realmKey(user)).map(c => c.script));
    expect(userScripts.size).toBe(2);
    expect([...userScripts][0]).toMatch(/^widget:a@1\.0\.0#[0-9a-f]{8}$/);
    // A changed source is another script
    expect(scriptKey({ kind: 'widget', id: 'a', version: '1.0.0', source: 'x' })).not.toBe(
      scriptKey({ kind: 'widget', id: 'a', version: '1.0.0', source: 'y' }),
    );
  });

  it("a malicious widget in someone's library can't touch the built-in grid", async () => {
    setScriptSandbox(createEngine(wasm));
    const p = sample();
    const level = p.levels[0].id;
    const before = await runWidget(BUILTIN, 'grid', grid, { ...p }, {}, ctx(level));
    const evil = def(`
      Array.prototype.map = function () { return [] };
      Array.prototype.push = function () { return 0 };
      JSON.stringify = () => '[]';
      function widget() { return [] }`);
    await runWidget({ origin: 'user', owner: 'mallory', id: 'evil' }, 'evil', evil, p, {}, ctx(level));
    const after = await runWidget(BUILTIN, 'grid', grid, { ...p }, {}, ctx(level));
    expect(after).toEqual(before);
    expect(after.ok && after.items.length).toBeGreaterThan(10);
  });
});

describe('widget capabilities', () => {
  const registry = createRegistry();
  const actor = { kind: 'user' as const };
  let session: Session;
  const call = (name: string, input: unknown) => registry.call(name, input, { session, actor });
  beforeEach(() => {
    session = new Session(createProject({ id: 't', name: '测试' }));
  });

  it('installs a widget, pinning its version and keeping only the params given', async () => {
    const r = await call('widget_install', { library: 'builtin-widgets', widget: 'grid', params: { spacing: 6000 } });
    expect(r.ok).toBe(true);
    expect(session.project.widgets).toEqual([
      { id: 'w01', name: '轴网', widget: { library: 'builtin-widgets', id: 'grid', version: grid.version }, params: { spacing: 6000 }, visible: true },
    ]);
    await call('widget_install', { library: 'builtin-widgets', widget: 'grid' });
    expect(session.project.widgets.map(w => w.name)).toEqual(['轴网', '轴网（2）']);
  });

  it('refuses an unknown widget and bad params', async () => {
    expect((await call('widget_install', { library: 'builtin-widgets', widget: 'nope' })).error?.code).toBe('not-found');
    expect((await call('widget_install', { library: 'builtin-widgets', widget: 'grid', params: { spacing: 1 } })).error?.code).toBe('invalid-input');
    expect((await call('widget_install', { library: 'builtin-widgets', widget: 'grid', params: { wat: 1 } })).error?.code).toBe('invalid-input');
    expect(session.project.widgets).toEqual([]);
  });

  it('configures, hides, renames, resets and removes it, through undo', async () => {
    await call('widget_install', { library: 'builtin-widgets', widget: 'grid' });
    expect((await call('widget_configure', { widget: '轴网', params: { spacing: 4200, originX: 0 }, visible: false, name: '主轴网' })).ok).toBe(true);
    expect(session.project.widgets[0]).toMatchObject({ name: '主轴网', params: { spacing: 4200, originX: 0 }, visible: false });
    expect((await call('widget_configure', { widget: 'w01', params: { spacing: 0 } })).error?.code).toBe('invalid-input');
    await call('widget_configure', { widget: 'w01', reset: ['spacing'] });
    expect(session.project.widgets[0].params).toEqual({ originX: 0 });
    expect((await call('find_objects', { type: 'widget' })).result).toMatchObject([{ id: 'w01', name: '主轴网', type: 'widget' }]);
    await call('widget_remove', { widget: 'w01' });
    expect(session.project.widgets).toEqual([]);
    await call('history_undo', {});
    expect(session.project.widgets).toHaveLength(1);
  });

  it('registers a user library, whose widgets install like the built-in ones', async () => {
    registerWidgetLibrary({ origin: 'user', owner: 'u1', id: 'mine' }, library('mine', { dot: def('function widget() { return [] }') }));
    try {
      expect((await call('widget_install', { library: 'mine', widget: 'dot' })).ok).toBe(true);
      expect(() => registerWidgetLibrary({ origin: 'user', owner: 'u1', id: 'x' }, library('builtin-widgets', {}))).toThrow(/built-in/);
    } finally {
      unregisterWidgetLibrary('mine');
    }
  });
});

describe('migration', () => {
  it('v15 adds widgets to older projects', () => {
    const old = { ...sampleFile(), version: 14 };
    delete (old as { widgets?: unknown }).widgets;
    const p = migrate(old);
    expect(p.version).toBe(15);
    expect(p.widgets).toEqual([]);
  });
});
