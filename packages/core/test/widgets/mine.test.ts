import { describe, expect, it } from 'vitest';
import {
  configureMyWidget,
  installMyWidget,
  myWidgetsSchema,
  myWidgetUpdate,
  realmKey,
  registerWidgetLibrary,
  removeMyWidget,
  resolveMyWidget,
  unregisterWidgetLibrary,
  updateMyWidget,
  type MyWidgets,
  type WidgetDef,
} from '../../src/index.js';

const def = (version: string, params: WidgetDef['params']): WidgetDef => ({
  name: { zh: '点', en: 'Dot' },
  version,
  description: 'A dot.',
  permissions: ['draw'],
  params,
  script: "function widget() { return [{ type: 'point', at: [0, 0] }] }",
});
const lib = (d: WidgetDef) => ({
  format: 'plinth-widgets' as const,
  formatVersion: 1 as const,
  id: 'lib_m',
  name: { zh: '我的组件' },
  version: '1.0.0',
  widgets: { dot: d },
});
const origin = { origin: 'user' as const, owner: 'u1', id: 'lib_m' };
const empty: MyWidgets = { widgets: [] };

describe("the user's own widgets", () => {
  it('installs built-in widgets without a copy and library widgets with one, in a realm of their own', () => {
    registerWidgetLibrary(origin, lib(def('1.0.0', { size: { type: 'number', default: 1, maximum: 9 } })));
    try {
      let set = installMyWidget(empty, 'builtin-widgets', 'grid', 'zh', { spacing: 3600 });
      set = installMyWidget(set, 'lib_m', 'dot', 'en', { size: 5 });
      expect(set.widgets.map(w => [w.id, w.name, w.widget.version])).toEqual([
        ['me-1', '轴网', expect.any(String)],
        ['me-2', 'Dot', '1.0.0'],
      ]);
      expect(Object.keys(set.copies!)).toEqual(['lib_m/dot']);
      expect(realmKey(resolveMyWidget(set, 'lib_m', 'dot')!.origin)).toBe('design:me/lib_m');
      expect(myWidgetsSchema.safeParse(set).success).toBe(true);
      expect(() => installMyWidget(set, 'lib_m', 'dot', 'en', { size: 99 })).toThrow();
      expect(() => installMyWidget(set, 'design', 'x', 'en')).toThrow(/save it to a widget library/);
    } finally {
      unregisterWidgetLibrary('lib_m');
    }
  });

  it('configures, offers and applies updates only when asked, and removes', () => {
    registerWidgetLibrary(origin, lib(def('1.0.0', { size: { type: 'number', default: 1, maximum: 9 } })));
    try {
      let set = installMyWidget(empty, 'lib_m', 'dot', 'zh');
      set = configureMyWidget(set, 'me-1', { params: { size: 8 }, visible: false });
      expect(set.widgets[0]).toMatchObject({ params: { size: 8 }, visible: false });
      expect(myWidgetUpdate(set, set.widgets[0])).toBeUndefined();
      registerWidgetLibrary(origin, lib(def('1.1.0', { size: { type: 'number', default: 1, maximum: 5 } })));
      expect(resolveMyWidget(set, 'lib_m', 'dot')!.def.version).toBe('1.0.0');
      expect(myWidgetUpdate(set, set.widgets[0])!.changes).toMatchObject({ from: '1.0.0', to: '1.1.0' });
      set = updateMyWidget(set, 'me-1');
      expect(set.widgets[0]).toMatchObject({ widget: { version: '1.1.0' }, params: {} });
      expect(set.copies!['lib_m/dot'].def.version).toBe('1.1.0');
      expect(removeMyWidget(set, 'me-1')).toEqual({ widgets: [] });
    } finally {
      unregisterWidgetLibrary('lib_m');
    }
  });

  it('refuses a malformed stored set', () => {
    expect(
      myWidgetsSchema.safeParse({ widgets: [{ id: 'w01', name: 'x', widget: { library: 'a', id: 'b', version: '1' }, params: {}, visible: true }] }).success,
    ).toBe(false);
    expect(myWidgetsSchema.safeParse({ widgets: [], copies: { 'a/b': { library: 'a', widget: 'b', def: { script: 'x' } } } }).success).toBe(false);
  });
});
