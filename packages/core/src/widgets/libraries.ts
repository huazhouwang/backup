/**
 * The widget libraries the app knows: the built-in ones (files in libraries/ at the repository root) and those registered at
 * run time (a user's or a team's). Each carries its origin, which decides its realm in the sandbox (scripts/runner.ts).
 */
import basicFile from '../../../../libraries/basic.widgetlib.json' with { type: 'json' };
import type { LibraryOrigin } from '../scripts/runner.js';
import type { Project } from '../model/schema.js';
import { parseWidgetLibrary, widgetDefSchema, type WidgetDef, type WidgetLibrary } from './format.js';

export interface KnownWidgetLibrary {
  origin: LibraryOrigin;
  library: WidgetLibrary;
}

/** Every widget library shipped with the app */
export const BUILTIN_WIDGET_LIBRARIES: WidgetLibrary[] = [parseWidgetLibrary(basicFile)];

const registered = new Map<string, KnownWidgetLibrary>();

/** Make a user's or a team's widget library known (replacing one with the same id) */
export function registerWidgetLibrary(origin: Exclude<LibraryOrigin, { origin: 'builtin' }>, library: WidgetLibrary) {
  if (library.id === DESIGN_WIDGETS || BUILTIN_WIDGET_LIBRARIES.some(l => l.id === library.id))
    throw new Error(`widget library id ${library.id} is a built-in one`);
  registered.set(library.id, { origin, library });
}

export function unregisterWidgetLibrary(id: string) {
  registered.delete(id);
}

/** Every known widget library, the built-in ones first */
export function widgetLibraries(): KnownWidgetLibrary[] {
  return [...BUILTIN_WIDGET_LIBRARIES.map(library => ({ origin: { origin: 'builtin' as const, id: library.id }, library })), ...registered.values()];
}

export const findWidgetLibrary = (id: string) => widgetLibraries().find(l => l.library.id === id);

/** A widget of a known library, with its library */
export function findWidget(library: string, widget: string): (KnownWidgetLibrary & { def: WidgetDef }) | undefined {
  const lib = findWidgetLibrary(library);
  const def = lib?.library.widgets[widget];
  return lib && def ? { ...lib, def } : undefined;
}

/** The widget library id an installed widget names when it is one of the design's own (library.widgets) */
export const DESIGN_WIDGETS = 'design';

/** Where a design keeps its copy of a library's widget (Library.widgetCopies) */
export const copyKey = (library: string, widget: string) => `${library}/${widget}`;

export const isBuiltinWidgetLibrary = (id: string) => BUILTIN_WIDGET_LIBRARIES.some(l => l.id === id);

/**
 * The widget an installed widget names, with where it comes from: one of the design's own; a built-in one; the design's copy of
 * a user's or team's library widget (run in a realm of the design's per library, so a design can't reach the library's own
 * realm by naming it); else the current version of a known library (a widget not in a design). A design's widgets are checked
 * against the format, since a design file may come from anywhere.
 */
export function resolveWidget(p: Project, library: string, widget: string): { origin: LibraryOrigin; def: WidgetDef } | undefined {
  const own = (map: Record<string, WidgetDef> | undefined, key: string) => (map && Object.hasOwn(map, key) ? map[key] : undefined);
  if (library === DESIGN_WIDGETS) {
    const def = own(p.library.widgets, widget);
    return def && checkedDef(def) ? { origin: { origin: 'design', id: p.id }, def } : undefined;
  }
  if (isBuiltinWidgetLibrary(library)) return findWidget(library, widget);
  const copies = p.library.widgetCopies;
  const copy = copies && Object.hasOwn(copies, copyKey(library, widget)) ? copies[copyKey(library, widget)] : undefined;
  if (copy)
    return copy.library === library && copy.widget === widget && checkedDef(copy.def)
      ? { origin: { origin: 'design', id: `${p.id}/${library}` }, def: copy.def }
      : undefined;
  return findWidget(library, widget);
}

/** What changed from one version of a widget to another, for the update prompt */
export function widgetChanges(from: WidgetDef, to: WidgetDef) {
  const before = Object.keys(from.params ?? {}),
    after = Object.keys(to.params ?? {});
  return {
    from: from.version,
    to: to.version,
    description: to.description !== from.description ? to.description : undefined,
    script: to.script !== from.script,
    paramsAdded: after.filter(k => !before.includes(k)),
    paramsRemoved: before.filter(k => !after.includes(k)),
    permissionsAdded: to.permissions.filter(x => !from.permissions.includes(x)),
  };
}

/**
 * A newer version of an installed widget in its library, when the library is known here and its version differs from the one
 * installed; with what changed
 */
export function widgetUpdate(p: Project, w: { widget: { library: string; id: string; version: string } }) {
  if (w.widget.library === DESIGN_WIDGETS) return undefined;
  const current = findWidget(w.widget.library, w.widget.id);
  const installed = resolveWidget(p, w.widget.library, w.widget.id);
  if (!current || current.def.version === w.widget.version) return undefined;
  return { library: current.library, def: current.def, changes: widgetChanges(installed?.def ?? current.def, current.def) };
}

const checked = new WeakMap<WidgetDef, boolean>();
function checkedDef(def: WidgetDef) {
  let ok = checked.get(def);
  if (ok === undefined) checked.set(def, (ok = widgetDefSchema.safeParse(def).success));
  return ok;
}
