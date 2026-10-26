/**
 * The widget libraries the app knows: the built-in ones (files in libraries/ at the repository root) and those registered at
 * run time (a user's or a team's). Each carries its origin, which decides its realm in the sandbox (scripts/runner.ts).
 */
import basicFile from '../../../../libraries/basic.widgetlib.json' with { type: 'json' };
import type { LibraryOrigin } from '../scripts/runner.js';
import { parseWidgetLibrary, type WidgetDef, type WidgetLibrary } from './format.js';

export interface KnownWidgetLibrary {
  origin: LibraryOrigin;
  library: WidgetLibrary;
}

/** Every widget library shipped with the app */
export const BUILTIN_WIDGET_LIBRARIES: WidgetLibrary[] = [parseWidgetLibrary(basicFile)];

const registered = new Map<string, KnownWidgetLibrary>();

/** Make a user's or a team's widget library known (replacing one with the same id) */
export function registerWidgetLibrary(origin: Exclude<LibraryOrigin, { origin: 'builtin' }>, library: WidgetLibrary) {
  if (BUILTIN_WIDGET_LIBRARIES.some(l => l.id === library.id)) throw new Error(`widget library id ${library.id} is a built-in one`);
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
