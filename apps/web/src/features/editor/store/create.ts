/**
 * Editor state, one per open plan. Data lives in the core package Session and all changes go through the capability list;
 * the store only handles view state, autosave, conflicts and the before/after comparison. It is built from slices that share
 * the session and the autosave timer (see StoreContext).
 */
import { findObject, Session, type Project } from '@plinth/core';
import { createStore, type StoreApi } from 'zustand';
import type { ViewState } from '../agent/view-capabilities';
import { editsSlice } from './edits';
import { persistenceSlice } from './persistence';
import type { EditorActions, EditorState, InitialProject } from './types';
import { uiSlice } from './ui';
import { viewSlice } from './view';

export type Store = EditorState & EditorActions;
export type EditorStore = ReturnType<typeof createEditorStore>;

/** What the slices share: the store's set and get, the session, and the autosave timer */
export interface StoreContext {
  set: StoreApi<Store>['setState'];
  get: () => Store;
  session: Session;
  /** Save soon (after a pause in editing), or after `ms` */
  scheduleSave(ms?: number): void;
  cancelSave(): void;
}

const firstLevel = (p: Project) => p.levels.find(l => !l.roof)?.id ?? p.levels[0]?.id ?? 'L1';

/** Floor the object is on */
export const levelOf = (p: Project, id: string): string | undefined => findObject(p, id)?.level;

export function createEditorStore(init: InitialProject, opts: { level?: string; mode?: '2d' | '3d'; focus?: string[] } = {}) {
  const session = new Session(init.content);
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  return createStore<Store>()((set, get) => {
    const ctx: StoreContext = {
      set,
      get,
      session,
      scheduleSave(ms = 1500) {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => void get().save(), ms);
      },
      cancelSave() {
        if (saveTimer) clearTimeout(saveTimer);
      },
    };

    const view: ViewState = {
      mode: opts.mode ?? '2d',
      level: opts.level && init.content.levels.some(l => l.id === opts.level) ? opts.level : firstLevel(init.content),
      selection: [],
      highlight: opts.focus ?? [],
      camera: null,
      layers: { furniture: true, dimensions: true, labels: true, cutaway: false },
    };

    return {
      projectId: init.id,
      name: init.name,
      role: init.role,
      version: init.version,
      models: init.models ?? [],
      projectModelId: init.projectModelId ?? null,
      defaultModelId: init.defaultModelId ?? null,
      session,
      project: init.content,
      view,
      ...viewSlice(ctx),
      ...editsSlice(ctx),
      ...persistenceSlice(ctx),
      ...uiSlice(ctx),
    };
  });
}
