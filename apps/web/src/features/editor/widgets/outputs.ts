/**
 * What the installed widgets draw: each visible widget run in the sandbox for the current level and view (results are cached in
 * core by project, params and context, so redrawing the same state runs nothing). The previous drawing stays until the new one
 * arrives. `overrides` stand in for params while a handle is being dragged.
 */
import { resolveMyWidget, resolveWidget, runWidget, type ParamValue, type Project, type WidgetItem } from '@opensu/core';
import { useEffect, useState } from 'react';
// Lets core start the sandbox when a widget first runs
import './sandbox';
import { useMyWidgets } from './mine';

export interface WidgetOutput {
  /** The installed widget */
  id: string;
  items: WidgetItem[];
  /** Why it draws nothing: its library isn't known here, or its script failed */
  error?: string;
}

export type ParamOverrides = Record<string, Record<string, ParamValue>>;

export function useWidgetOutputs(project: Project, level: string, view: 'plan' | '3d', overrides: ParamOverrides = {}): WidgetOutput[] {
  const [outputs, setOutputs] = useState<WidgetOutput[]>([]);
  const overridesKey = JSON.stringify(overrides);
  // The user's own widgets ("for me") draw with the design's
  const { set: mine } = useMyWidgets();
  useEffect(() => {
    const own = new Set(mine.widgets.map(w => w.id));
    const shown = [...project.widgets, ...mine.widgets].filter(w => w.visible);
    if (!shown.length) return setOutputs([]);
    let live = true;
    void Promise.all(
      shown.map(async (w): Promise<WidgetOutput> => {
        const found = own.has(w.id) ? resolveMyWidget(mine, w.widget.library, w.widget.id) : resolveWidget(project, w.widget.library, w.widget.id);
        if (!found) return { id: w.id, items: [], error: 'unknown widget' };
        const r = await runWidget(
          found.origin,
          w.widget.id,
          found.def,
          project,
          { ...w.params, ...overrides[w.id] },
          { level, view, language: project.language },
        );
        return r.ok ? { id: w.id, items: r.items } : { id: w.id, items: [], error: r.error.message };
      }),
    ).then(out => live && setOutputs(out));
    return () => {
      live = false;
    };
  }, [project, mine, level, view, overridesKey]);
  return outputs;
}

/** The items of these outputs that belong on a level: their own level, else the current one */
export const itemsOn = (outputs: WidgetOutput[], level: string, current: string) =>
  outputs.flatMap(o => o.items.filter(i => (i.level ?? current) === level).map(item => ({ widget: o.id, item })));

/** Every snap point on the current level */
export const snapPoints = (outputs: WidgetOutput[], level: string) =>
  itemsOn(outputs, level, level).flatMap(({ item }) => (item.type === 'snap' ? [item.at] : []));
