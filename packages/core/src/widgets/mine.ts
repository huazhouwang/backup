/**
 * The user's own set of widgets ("for me"): widgets a user installs for themselves, drawn in every design they open alongside the
 * design's own, kept in their settings rather than in any design. Like a design, the set keeps a copy of each library widget at
 * the version installed (built-in ones excepted), offers newer versions and applies them only when asked. These functions return
 * a new set; the app stores it.
 */
import { z } from 'zod';
import { nameIn } from '../looks/material.js';
import type { ParamValue } from '../looks/script.js';
import type { Project, ProjectLanguage, WidgetCopy, WidgetInstance } from '../model/schema.js';
import { WidgetError, widgetDefSchema, type WidgetDef } from './format.js';
import { copyKey, findWidget, isBuiltinWidgetLibrary, resolveWidget, widgetUpdate, DESIGN_WIDGETS } from './libraries.js';
import { widgetParams } from './run.js';

export interface MyWidgets {
  widgets: WidgetInstance[];
  copies?: Record<string, WidgetCopy>;
}

/** Ids of the set's widgets start with this, apart from any design's (w01…) */
export const MY_WIDGET_PREFIX = 'me-';
export const isMyWidget = (id: string) => id.startsWith(MY_WIDGET_PREFIX);
export const MY_WIDGET_LIMIT = 30;

/** The set seen as a design for resolving its widgets: its copies run in realms of their own (design:me/<library>) */
const asDesign = (set: MyWidgets) => ({ id: 'me', library: { widgetCopies: set.copies } }) as unknown as Project;

export const resolveMyWidget = (set: MyWidgets, library: string, widget: string) => resolveWidget(asDesign(set), library, widget);
export const myWidgetUpdate = (set: MyWidgets, w: WidgetInstance) => widgetUpdate(asDesign(set), w);

const check = (def: WidgetDef, params: Record<string, ParamValue>) => (widgetParams(def, params), params);

export function installMyWidget(
  set: MyWidgets,
  library: string,
  widget: string,
  language: ProjectLanguage,
  params: Record<string, ParamValue> = {},
): MyWidgets {
  if (library === DESIGN_WIDGETS) throw new WidgetError("a design's own widget can't be installed for yourself; save it to a widget library first");
  if (set.widgets.length >= MY_WIDGET_LIMIT) throw new WidgetError(`at most ${MY_WIDGET_LIMIT} widgets`);
  const found = resolveMyWidget(set, library, widget) ?? findWidget(library, widget);
  if (!found) throw new WidgetError(`no widget ${widget} in widget library ${library}`);
  const copies =
    isBuiltinWidgetLibrary(library) || set.copies?.[copyKey(library, widget)]
      ? set.copies
      : { ...set.copies, [copyKey(library, widget)]: { library, widget, libraryName: findWidget(library, widget)?.library.name, def: found.def } };
  const n = Math.max(0, ...set.widgets.map(w => Number(w.id.slice(MY_WIDGET_PREFIX.length)) || 0)) + 1;
  const w: WidgetInstance = {
    id: `${MY_WIDGET_PREFIX}${n}`,
    name: nameIn(found.def.name, language) ?? widget,
    widget: { library, id: widget, version: found.def.version },
    params: check(found.def, params),
    visible: true,
  };
  return { widgets: [...set.widgets, w], ...(copies ? { copies } : {}) };
}

export function configureMyWidget(set: MyWidgets, id: string, change: { params?: Record<string, ParamValue>; reset?: string[]; visible?: boolean }): MyWidgets {
  return {
    ...set,
    widgets: set.widgets.map(w => {
      if (w.id !== id) return w;
      const params = { ...w.params, ...change.params };
      for (const k of change.reset ?? []) delete params[k];
      const found = resolveMyWidget(set, w.widget.library, w.widget.id);
      return { ...w, params: found ? check(found.def, params) : params, ...(change.visible !== undefined ? { visible: change.visible } : {}) };
    }),
  };
}

export function removeMyWidget(set: MyWidgets, id: string): MyWidgets {
  const gone = set.widgets.find(w => w.id === id);
  const widgets = set.widgets.filter(w => w.id !== id);
  if (!gone) return set;
  const key = copyKey(gone.widget.library, gone.widget.id);
  const used = widgets.some(w => w.widget.library === gone.widget.library && w.widget.id === gone.widget.id);
  const { [key]: _drop, ...rest } = set.copies ?? {};
  return { widgets, ...(used ? (set.copies ? { copies: set.copies } : {}) : Object.keys(rest).length ? { copies: rest } : {}) };
}

/** The newer version of a widget of the set, for all of its copies; params it refuses go back to defaults */
export function updateMyWidget(set: MyWidgets, id: string): MyWidgets {
  const w = set.widgets.find(x => x.id === id);
  const update = w && myWidgetUpdate(set, w);
  if (!w || !update) return set;
  const { library, id: widget } = w.widget;
  const copies = isBuiltinWidgetLibrary(library)
    ? set.copies
    : { ...set.copies, [copyKey(library, widget)]: { library, widget, libraryName: update.library.name, def: update.def } };
  const keep = (params: Record<string, ParamValue>) =>
    Object.fromEntries(
      Object.entries(params).filter(([k, v]) => {
        try {
          widgetParams(update.def, { [k]: v });
          return true;
        } catch {
          return false;
        }
      }),
    );
  return {
    widgets: set.widgets.map(x =>
      x.widget.library === library && x.widget.id === widget ? { ...x, widget: { ...x.widget, version: update.def.version }, params: keep(x.params) } : x,
    ),
    ...(copies ? { copies } : {}),
  };
}

const zValue = z.union([z.string().max(500), z.number(), z.boolean(), z.null()]);
/** A stored set, as the server accepts it */
export const myWidgetsSchema: z.ZodType<MyWidgets> = z.object({
  widgets: z
    .array(
      z.object({
        id: z.string().regex(/^me-\d{1,4}$/),
        name: z.string().max(200),
        widget: z.object({ library: z.string().max(64), id: z.string().max(64), version: z.string().max(40) }),
        params: z.record(z.string().max(64), zValue),
        visible: z.boolean(),
      }),
    )
    .max(MY_WIDGET_LIMIT),
  copies: z
    .record(
      z.string().max(130),
      z.object({
        library: z.string().max(64),
        widget: z.string().max(64),
        libraryName: z.record(z.string(), z.string().max(200)).optional(),
        def: widgetDefSchema,
      }),
    )
    .optional(),
}) as z.ZodType<MyWidgets>;
