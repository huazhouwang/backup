/**
 * Running the design's canvas modules (issue 171) in the page: each module is an ES module, `export default function (canvas) {…}`,
 * loaded from its source and given a canvas of its own. What a module adds through that canvas (layers, toolbar buttons, snaps,
 * listeners) is tracked, so it goes when the module is stopped, replaced or removed; the module may also return a cleanup. A
 * module that throws is reported and, if it was replacing a version that worked, that version runs again.
 */
import type { CanvasModule, Project } from '@plinth/core';
import { bridge, report } from './bridge';
import type { Canvas } from './page';

/** What a module gets: the page's canvas, with its own id, its data, and additions that are undone when it stops */
export interface ModuleCanvas extends Canvas {
  id: string;
  /** The module's own data (JSON), kept in the design: set() saves it through canvas_data_set, so it undoes and is shared */
  data: {
    get<T = unknown>(): T | undefined;
    set(value: unknown): ReturnType<typeof bridge.call>;
    on(fn: (value: unknown) => void): () => void;
  };
  /** A layer of the module's own above the plan (cleared when the module stops) */
  layer(name?: string): SVGGElement;
}

interface Running {
  version: number;
  source: string;
  stop(): void;
}

const running = new Map<string, Running>();
/** The last source of each module that ran without throwing */
const good = new Map<string, { version: number; source: string }>();

const base64 = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
};

/** A canvas for one module, recording what it adds so stop() can take it away */
function moduleCanvas(canvas: Canvas, id: string) {
  const undo: (() => void)[] = [];
  const layers = new Map<string, SVGGElement>();
  const track = (fn: () => void) => (undo.push(fn), fn);
  const ctx: ModuleCanvas = {
    ...canvas,
    id,
    bridge: {
      ...canvas.bridge,
      on: ((event, fn) => track(canvas.bridge.on(event, fn))) as typeof bridge.on,
    },
    addSnaps: p => track(canvas.addSnaps(p)),
    layer(name = 'main') {
      let g = layers.get(name);
      if (!g) {
        g = canvas.view.layer(`${id}:${name}`);
        layers.set(name, g);
      }
      return g;
    },
    view: {
      ...canvas.view,
      onDraw: fn => track(canvas.view.onDraw(fn)),
    },
    button(label, onClick, opts) {
      const b = canvas.button(label, onClick, opts);
      track(() => b.remove());
      return b;
    },
    data: {
      get: <T>() => bridge.project().canvas?.data?.[id] as T | undefined,
      set: value => bridge.call('canvas_data_set', { module: id, data: value }),
      on(fn) {
        let last = bridge.project().canvas?.data?.[id];
        return track(
          bridge.on('project', p => {
            const v = p.canvas?.data?.[id];
            if (v !== last) fn((last = v));
          }),
        );
      },
    },
  };
  const stop = () => {
    for (const fn of undo.splice(0).reverse()) fn();
    for (const g of layers.values()) g.replaceChildren();
  };
  return { ctx, stop };
}

/**
 * Import a module from its source. The import runs from a small inline script rather than from here: a dynamic import resolves
 * against its importer's URL, and the wheels' own is a data: URL of over a megabyte, which the browser parses on every import
 * (seconds each).
 */
let loads = 0;
const loading = new Map<number, { resolve(m: { default?: unknown }): void; reject(e: unknown): void }>();
const g = globalThis as unknown as Record<string, unknown>;
g.plinthModuleLoaded = (n: number, m: { default?: unknown }) => (loading.get(n)?.resolve(m), loading.delete(n));
g.plinthModuleFailed = (n: number, e: unknown) => (loading.get(n)?.reject(e), loading.delete(n));
function importSource(source: string): Promise<{ default?: unknown }> {
  return new Promise((resolve, reject) => {
    const n = ++loads;
    loading.set(n, { resolve, reject });
    const s = document.createElement('script');
    s.type = 'module';
    s.textContent = `import(${JSON.stringify(`data:text/javascript;base64,${base64(source)}`)}).then(m => plinthModuleLoaded(${n}, m), e => plinthModuleFailed(${n}, e));`;
    document.head.appendChild(s);
    s.remove();
  });
}

/** Load and start a module; resolves with its stop function, or throws what it threw */
async function start(canvas: Canvas, id: string, source: string): Promise<() => void> {
  const { ctx, stop } = moduleCanvas(canvas, id);
  try {
    const mod = await importSource(source);
    if (typeof mod.default !== 'function') throw new Error('a canvas module must `export default function (canvas) { … }`');
    const cleanup = await (mod.default as (c: ModuleCanvas) => unknown)(ctx);
    return () => {
      try {
        if (typeof cleanup === 'function') cleanup();
      } finally {
        stop();
      }
    };
  } catch (e) {
    stop();
    throw e;
  }
}

/** Module work (syncing, trying) runs one job at a time, so a trial's restore and a resync never start the same module twice */
let queue: Promise<unknown> = Promise.resolve();
const serial = <T>(job: () => Promise<T>): Promise<T> => {
  const next = queue.then(job, job);
  queue = next.catch(() => undefined);
  return next;
};

const message = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));

/**
 * Bring the running modules in line with the design's: start new ones, restart changed ones, stop removed ones. Queued, it syncs to
 * the design as it is when its turn comes.
 */
export const syncModules = (canvas: Canvas) => serial(() => syncAll(canvas, bridge.project()));

async function syncAll(canvas: Canvas, p: Project) {
  const wanted = p.canvas?.modules ?? [];
  for (const [id, r] of running)
    if (!wanted.some(m => m.id === id)) {
      r.stop();
      running.delete(id);
    }
  for (const m of wanted) await syncOne(canvas, m);
}

async function syncOne(canvas: Canvas, m: CanvasModule) {
  const r = running.get(m.id);
  if (r && r.version === m.version && r.source === m.source) return;
  r?.stop();
  running.delete(m.id);
  try {
    const stop = await start(canvas, m.id, m.source);
    running.set(m.id, { version: m.version, source: m.source, stop });
    good.set(m.id, { version: m.version, source: m.source });
  } catch (e) {
    report(`module:${m.id}`, e);
    // Back to the last version that worked, if there is one
    const last = good.get(m.id);
    if (last && last.source !== m.source)
      try {
        running.set(m.id, { ...last, stop: await start(canvas, m.id, last.source) });
      } catch (e2) {
        report(`module:${m.id}`, e2);
      }
  }
}

/**
 * Try a module before it is saved: run it for a moment beside the others (errors thrown while it starts, or soon after from what it
 * set up, count), then stop it
 */
export const tryModule = (canvas: Canvas, id: string, source: string) => serial(() => trial(canvas, id, source));

async function trial(canvas: Canvas, id: string, source: string): Promise<{ ok: true } | { ok: false; error: string }> {
  let late: string | null = null;
  const onError = (e: ErrorEvent) => (late ??= message(e.error ?? e.message));
  const onRejection = (e: PromiseRejectionEvent) => (late ??= message(e.reason));
  addEventListener('error', onError);
  addEventListener('unhandledrejection', onRejection);
  // The saved version, if any, steps aside while the new one is tried
  const current = running.get(id);
  current?.stop();
  try {
    const stop = await start(canvas, id, source);
    await new Promise(r => setTimeout(r, 300));
    stop();
    return late ? { ok: false, error: late } : { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  } finally {
    removeEventListener('error', onError);
    removeEventListener('unhandledrejection', onRejection);
    if (current) {
      running.delete(id);
      const m = bridge.project().canvas?.modules.find(x => x.id === id);
      if (m) await syncOne(canvas, m);
    }
  }
}
