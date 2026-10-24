/**
 * Saving: autosave after edits (each save names its version from the edits it carries), conflicts with someone else's save,
 * opening an earlier version read-only and restoring one
 */
import type { Project } from '@plinth/core';
import { api, ApiError } from '@/lib/api';
import { m } from '@/lib/i18n';
import type { StoreContext } from './create';
import type { EditorActions, EditorState, InitialProject } from './types';

type Persistence = Pick<EditorState, 'readOnlyVersion' | 'dirty' | 'saving' | 'savedAt' | 'conflict'> &
  Pick<EditorActions, 'save' | 'resolveConflict' | 'loadVersion' | 'restoreVersion' | 'connect'>;

export const persistenceSlice = ({ set, get, session, scheduleSave, cancelSave }: StoreContext): Persistence => ({
  readOnlyVersion: null,
  dirty: false,
  saving: false,
  savedAt: null,
  conflict: null,

  async save({ force = false, checkpoint = false } = {}) {
    const s = get();
    if (!s.dirty || s.saving || s.conflict || !s.canEdit()) return;
    set({ saving: true });
    const labels = s.pendingLabels;
    const summary =
      (labels.length > 3 ? [...labels.slice(0, 3), m.store_summary_more({ count: labels.length })] : labels).join(m.store_summary_separator()).slice(0, 200) ||
      m.store_summary_default();
    const snapshot = session.project;
    try {
      const r = await api<{ version: number }>(`/projects/${s.projectId}`, {
        method: 'PUT',
        json: { base: s.version, summary, content: snapshot, ...(checkpoint ? { checkpoint } : {}) },
      });
      set(cur => ({
        version: r.version,
        saving: false,
        savedAt: Date.now(),
        // New changes during save: stay dirty and save again later
        dirty: session.project !== snapshot,
        pendingLabels: cur.pendingLabels.slice(labels.length),
      }));
      if (get().dirty) scheduleSave(800);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.data?.conflict) {
        set({ saving: false, conflict: { version: e.data.version, content: e.data.content } });
        if (force) await get().resolveConflict('mine');
      } else {
        set({ saving: false });
        throw e;
      }
    }
  },

  async resolveConflict(keep) {
    const c = get().conflict;
    if (!c) return;
    if (keep === 'theirs') {
      session.load(c.content);
      set({ conflict: null, version: c.version, dirty: false, pendingLabels: [], lastChange: null });
    } else {
      set({ conflict: null, version: c.version });
      await get().save();
    }
  },

  async loadVersion(version) {
    if (version == null) {
      const r = await api<InitialProject>(`/projects/${get().projectId}`);
      session.load(r.content);
      set({ readOnlyVersion: null, version: r.version, dirty: false, pendingLabels: [], lastChange: null });
      return;
    }
    if (get().dirty) await get().save();
    const r = await api<{ version: number; content: Project }>(`/projects/${get().projectId}/versions/${version}`);
    session.load(r.content);
    set({ readOnlyVersion: version, dirty: false, lastChange: null });
  },

  async restoreVersion(version) {
    const r = await api<{ content: Project }>(`/projects/${get().projectId}/versions/${version}`);
    await get().loadVersion(null);
    session.load(r.content);
    set({ dirty: true, pendingLabels: [m.panels_restore_label({ version })], lastChange: null });
    await get().save({ checkpoint: true });
  },

  connect() {
    const unsubscribe = session.subscribe((p, reason) => {
      // Loading a version or the other side of a conflict is not an edit: nothing to save
      if (reason === 'load') return set({ project: p });
      set({ project: p, dirty: true });
      scheduleSave();
    });
    return () => {
      unsubscribe();
      cancelSave();
    };
  },
});
