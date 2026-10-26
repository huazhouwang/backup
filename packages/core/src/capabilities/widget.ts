/** Widget capabilities: install a widget from a widget library on the design's canvas, configure it, remove it. */
import { z } from 'zod';
import { defineEdit } from './capability.js';
import { nextId, uniqueName } from '../geometry/topology.js';
import { TxError } from '../session/session.js';
import { text } from '../i18n.js';
import { nameIn } from '../looks/material.js';
import type { ParamValue } from '../looks/script.js';
import { resolve } from '../model/refs.js';
import type { WidgetInstance } from '../model/schema.js';
import { findWidget } from '../widgets/libraries.js';
import { widgetParams } from '../widgets/run.js';
import { zRef } from './inputs.js';

const zParams = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]));

function widgetOf(library: string, widget: string) {
  const found = findWidget(library, widget);
  if (!found) throw new TxError('not-found', text('err_widget_not_found', 'No widget {widget} in widget library {library}', { widget, library }));
  return found;
}

/** Checked params, or a TxError naming the problem */
function checked(def: Parameters<typeof widgetParams>[0], params: Record<string, ParamValue>) {
  try {
    widgetParams(def, params);
  } catch (e) {
    throw new TxError('invalid-input', text('err_widget_params', 'Widget parameters: {problem}', { problem: (e as Error).message }));
  }
  return params;
}

export const widgetInstall = defineEdit({
  name: 'widget_install',
  title: 'Install widget',
  description:
    "Install a widget from a widget library on the design's canvas (a structural grid, a coordinate system…). params sets some of its parameters; the rest take their defaults. The installed version is pinned.",
  input: z.object({
    library: z.string().describe('Widget library id, e.g. builtin-widgets'),
    widget: z.string().describe('Widget id in that library, e.g. grid'),
    params: zParams.optional().describe('Parameter values, by name; see the widget’s params'),
    name: z.string().optional().describe('Display name, in the language the project data uses; by default the widget’s name'),
  }),
  label: (i, p) => text('log_widget_install', 'Install {name}', { name: i.name ?? nameIn(findWidget(i.library, i.widget)?.def.name, p.language) ?? i.widget }),
  apply: (p, i) => {
    const { library, def } = widgetOf(i.library, i.widget);
    const params = checked(def, i.params ?? {});
    const w: WidgetInstance = {
      id: nextId(p, 'w'),
      name: uniqueName(
        p.widgets.map(x => x.name),
        i.name ?? nameIn(def.name, p.language),
        p.language,
      ),
      widget: { library: library.id, id: i.widget, version: def.version },
      params,
      visible: true,
    };
    p.widgets.push(w);
    return { id: w.id, name: w.name };
  },
});

export const widgetConfigure = defineEdit({
  name: 'widget_configure',
  title: 'Configure widget',
  description: 'Change an installed widget: set some parameters (null where the parameter allows it; reset brings back defaults), show or hide it, rename it.',
  input: z.object({
    widget: zRef('installed widget'),
    params: zParams.optional().describe('Parameter values to set, by name'),
    reset: z.array(z.string()).optional().describe('Parameters to bring back to their defaults'),
    visible: z.boolean().optional(),
    name: z.string().optional(),
  }),
  label: (i, p) => text('log_widget_configure', 'Change {name}', { name: resolve(p, 'widget', i.widget).name }),
  apply: (p, i) => {
    const w = resolve(p, 'widget', i.widget).obj;
    const params = { ...w.params, ...i.params };
    for (const k of i.reset ?? []) delete params[k];
    const found = findWidget(w.widget.library, w.widget.id);
    // A widget whose library isn't known here (not shared with this user) keeps its values unchecked
    w.params = found ? checked(found.def, params) : params;
    if (i.visible !== undefined) w.visible = i.visible;
    if (i.name)
      w.name = uniqueName(
        p.widgets.filter(x => x !== w).map(x => x.name),
        i.name,
        p.language,
      );
    return { id: w.id, name: w.name };
  },
});

export const widgetRemove = defineEdit({
  name: 'widget_remove',
  title: 'Remove widget',
  description: "Remove an installed widget from the design's canvas.",
  input: z.object({ widget: zRef('installed widget') }),
  label: (i, p) => text('log_widget_remove', 'Remove {name}', { name: resolve(p, 'widget', i.widget).name }),
  apply: (p, i) => {
    const w = resolve(p, 'widget', i.widget).obj;
    p.widgets.splice(p.widgets.indexOf(w), 1);
    return { id: w.id };
  },
});
