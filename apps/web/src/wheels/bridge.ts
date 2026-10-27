/**
 * Wheel `bridge`: the page's only way to the design. It keeps the page's copy of the design (patched as the editor changes it),
 * the current level and the selection, and calls capabilities through the editor: the same registry the editor and its agent
 * use, so a change from the page is checked by the building rules, undoable and saved like any other.
 */
import type { CanvasPage, Project } from '@opensu/core';
import { applyDiff, type CallReply, type HostMessage, type Init, type ModuleScope, type PageMessage } from './protocol';

type Events = { project: Project; level: string; selection: string[]; canEdit: boolean };
type Listener<K extends keyof Events> = (value: Events[K]) => void;

let state: Init | null = null;
let selection: string[] = [];
let callId = 0;
const pending = new Map<number, (r: CallReply) => void>();
const listeners: { [K in keyof Events]: Set<Listener<K>> } = { project: new Set(), level: new Set(), selection: new Set(), canEdit: new Set() };
const emit = <K extends keyof Events>(k: K, v: Events[K]) => {
  for (const fn of listeners[k]) {
    try {
      fn(v);
    } catch (e) {
      report('listener', e);
    }
  }
};

/** Send a message to the editor */
export const post = (m: PageMessage) => parent.postMessage(m, '*');

/** Tell the editor something went wrong in the page (a module that threw, a listener that failed) */
export function report(source: string, e: unknown) {
  post({ type: 'error', source, message: e instanceof Error ? `${e.name}: ${e.message}` : String(e) });
}

/** Keys the page didn't use go to the editor, so its shortcuts work with the focus in the page */
addEventListener('keydown', e => {
  if (e.defaultPrevented) return;
  const { key, code, shiftKey, ctrlKey, metaKey, altKey, repeat } = e;
  post({ type: 'key', key, code, shiftKey, ctrlKey, metaKey, altKey, repeat });
});

type TryResult = { ok: true; drawn?: unknown } | { ok: false; error: string };
type Trier = (scope: ModuleScope, id: string, source: string) => Promise<TryResult>;
let tryHandler: Trier | null = null;
/** How the page tries a module the editor is about to save (set by the page once it runs modules) */
export const onTry = (fn: Trier) => (tryHandler = fn);

let captureHandler: (() => Promise<{ dataUrl: string; width: number; height: number }>) | null = null;
/** How the page renders itself to an image when the editor asks (view_screenshot) */
export const onCapture = (fn: typeof captureHandler) => (captureHandler = fn);

const mineListeners = new Set<(page: CanvasPage) => void>();
/** The person's own modules and their data (not part of the design) */
export const myCanvas = (): CanvasPage => state?.mine ?? { modules: [] };
/** Hear when the person's own modules or their data change */
export const onMine = (fn: (page: CanvasPage) => void) => (mineListeners.add(fn), () => void mineListeners.delete(fn));
/** Save the data of one of the person's own modules, in their settings */
export function setMyData(module: string, data: unknown): Promise<CallReply> {
  const id = ++callId;
  post({ type: 'mydata', id, module, data });
  return new Promise(resolve => pending.set(id, resolve));
}

let ready: Promise<Init> | null = null;
/** Wait for the editor's first message (the design, level, selection); listen for what follows */
export function connect(): Promise<Init> {
  ready ??= new Promise(resolve => {
    addEventListener('message', (e: MessageEvent<HostMessage>) => {
      if (e.source !== parent) return;
      const m = e.data;
      switch (m.type) {
        case 'init':
          state = { ...m };
          selection = m.selection;
          resolve(state);
          return;
        case 'project':
          if (!state) return;
          state.project = applyDiff(state.project, m.diff);
          emit('project', state.project);
          // How long the change took to reach the page and be drawn (both sides read the same clock)
          requestAnimationFrame(() => post({ type: 'perf', name: 'update', ms: Date.now() - m.sentAt }));
          return;
        case 'level':
          if (!state) return;
          state.level = m.level;
          emit('level', m.level);
          return;
        case 'selection':
          // The editor's selection holds the design's objects; ids the page's own modules select stay alongside
          selection = [...m.ids, ...selection.filter(id => !isObject(id))];
          emit('selection', selection);
          return;
        case 'canEdit':
          if (!state) return;
          state.canEdit = m.canEdit;
          emit('canEdit', m.canEdit);
          return;
        case 'capture':
          void captureHandler?.().then(
            c => post({ type: 'captured', reqId: m.reqId, ...c }),
            e => post({ type: 'captured', reqId: m.reqId, error: String(e) }),
          );
          return;
        case 'mine':
          if (!state) return;
          state.mine = m.page;
          for (const fn of mineListeners) {
            try {
              fn(m.page);
            } catch (e) {
              report('listener', e);
            }
          }
          return;
        case 'reply':
          pending.get(m.id)?.(m.reply);
          pending.delete(m.id);
          return;
        case 'try':
          void (tryHandler ? tryHandler(m.scope, m.id, m.source) : Promise.resolve({ ok: false as const, error: 'the page is not ready' })).then(r =>
            post({ type: 'tried', reqId: m.reqId, ok: r.ok, ...(r.ok ? { drawn: r.drawn } : { error: r.error }) }),
          );
      }
    });
  });
  return ready;
}

const need = () => {
  if (!state) throw new Error('bridge: not connected yet (await connect())');
  return state;
};

/** Whether an id names an object of the design (a wall, a room, furniture…) rather than something a module drew */
function isObject(id: string) {
  const p = state?.project;
  if (!p) return false;
  return (
    p.walls.some(w => w.id === id || w.openings.some(o => o.id === id)) ||
    p.spaces.some(s => s.id === id) ||
    p.furniture.some(f => f.id === id) ||
    p.elements.some(x => x.id === id)
  );
}

export const bridge = {
  /** The design as it is now */
  project: () => need().project,
  /** The level shown */
  level: () => need().level,
  /** Ids selected: the design's objects and anything a module made selectable */
  selection: () => selection,
  /** Whether the person looking may change the design */
  canEdit: () => need().canEdit,
  /** The interface language */
  locale: () => need().locale,
  /** Listen for a change; returns a function that stops listening */
  on<K extends keyof Events>(event: K, fn: Listener<K>): () => void {
    listeners[event].add(fn);
    return () => listeners[event].delete(fn);
  },
  /** Select these ids (the design's objects among them are selected in the editor too) */
  select(ids: string[]) {
    selection = ids;
    emit('selection', ids);
    post({ type: 'select', ids: ids.filter(isObject) });
  },
  /**
   * Run a capability (wall_add, furniture_move, …) as the person looking; resolves with its result. Refused when they may not
   * edit, or for capabilities a page may not call.
   */
  call(name: string, input: unknown): Promise<CallReply> {
    const id = ++callId;
    post({ type: 'call', id, name, input });
    return new Promise(resolve => pending.set(id, resolve));
  },
};

export type Bridge = typeof bridge;
