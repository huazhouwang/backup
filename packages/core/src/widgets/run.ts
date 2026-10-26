/**
 * Running an installed widget: its params resolved against its declarations, its script run in the sandbox under its library's
 * realm, its output validated. Results are cached by project (each change makes a new project object), script, params and
 * context, so drawing the same state twice runs nothing.
 */
import { checkParamValue, type ParamValue } from '../looks/script.js';
import type { Project } from '../model/schema.js';
import { runSandboxed, ScriptError, scriptKey, type LibraryOrigin } from '../scripts/runner.js';
import { validateWidgetOutput, WidgetError, type WidgetContext, type WidgetDef, type WidgetItem } from './format.js';

export type WidgetResult = { ok: true; items: WidgetItem[] } | { ok: false; error: { kind: ScriptError['kind']; message: string } };

/** A widget's params: each declared one from the given values, else its default; values that don't fit are refused */
export function widgetParams(def: Pick<WidgetDef, 'params'>, given: Record<string, ParamValue> = {}): Record<string, ParamValue> {
  const decls = def.params ?? {};
  for (const name of Object.keys(given)) if (!decls[name]) throw new WidgetError(`unknown parameter ${name}`);
  return Object.fromEntries(
    Object.entries(decls).map(([name, d]) => {
      const v = name in given ? given[name] : d.default;
      const problem = checkParamValue(d, v, name);
      if (problem) throw new WidgetError(problem);
      return [name, v];
    }),
  );
}

/** The script as run: the widget's own, then an entry point that hands it the project kept in its context */
const ENTRY = '\n;function __plinth_widget(params, ctx) { return widget(__plinth_project, params, ctx) }\n';

const cache = new WeakMap<Project, Map<string, Promise<WidgetResult>>>();

export function runWidget(
  library: LibraryOrigin,
  id: string,
  def: WidgetDef,
  project: Project,
  given: Record<string, ParamValue>,
  ctx: WidgetContext,
): Promise<WidgetResult> {
  let params: Record<string, ParamValue>;
  try {
    params = widgetParams(def, given);
  } catch (e) {
    return Promise.resolve({ ok: false, error: { kind: 'invalid', message: (e as Error).message } });
  }
  const ref = { library, kind: 'widget' as const, id, version: def.version, source: def.script + ENTRY };
  const key = `${JSON.stringify(library)}\n${scriptKey(ref)}\n${JSON.stringify(params)}\n${JSON.stringify(ctx)}`;
  let byKey = cache.get(project);
  if (!byKey) cache.set(project, (byKey = new Map()));
  let result = byKey.get(key);
  if (!result) {
    result = (async (): Promise<WidgetResult> => {
      try {
        return { ok: true, items: validateWidgetOutput(await runSandboxed(ref, { __plinth_project: project }, '__plinth_widget', [params, ctx]), def) };
      } catch (e) {
        return { ok: false, error: e instanceof ScriptError ? { kind: e.kind, message: e.message } : { kind: 'invalid', message: (e as Error).message } };
      }
    })();
    byKey.set(key, result);
    // A crash or a missing sandbox says nothing about the widget: don't keep it
    const map = byKey;
    void result.then(r => !r.ok && (r.error.kind === 'crash' || r.error.kind === 'unavailable') && map.delete(key));
  }
  return result;
}
