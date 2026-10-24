/** Edits: calling capabilities (checking the role), previewing a call on a scratch copy, undo and redo, and what just changed */
import { capabilityTitle, mutates, Session } from '@plinth/core';
import { registry } from '../agent/registry';
import { m } from '@/lib/i18n';
import { can } from '@/shared/roles';
import type { StoreContext } from './create';
import { commentsHost, librariesHost, LOOK_EDITS, looksHost } from './hosts';
import type { EditorActions, EditorState } from './types';

type Edits = Pick<EditorState, 'lastChange' | 'lookChange' | 'pendingLabels'> &
  Pick<EditorActions, 'call' | 'preview' | 'undo' | 'redo' | 'canEdit' | 'clearLookChange'>;

export const editsSlice = ({ set, get, session }: StoreContext): Edits => {
  const host = () => ({ view: get().viewHost(), comments: commentsHost(get().projectId), looks: looksHost, libraries: librariesHost });
  return {
    lastChange: null,
    lookChange: null,
    pendingLabels: [],

    canEdit: () => can(get().role, 'editor') && get().readOnlyVersion == null,

    async call(name, input, actor = { kind: 'user' }) {
      const cap = registry.get(name);
      if (cap && mutates(cap) && !get().canEdit()) {
        return { ok: false, error: { code: 'forbidden', message: get().readOnlyVersion != null ? m.store_readonly_history() : m.store_readonly_viewer() } };
      }
      const before = session.project;
      const r = await registry.call(name, input, { session, actor, host: host() });
      if (r.ok && LOOK_EDITS.has(name)) {
        const res = r.result as { id?: string; look?: string };
        const id = name === 'furniture_type_add' ? res.look : res.id;
        if (id) set({ lookChange: { id, isNew: name !== 'look_update', at: Date.now() } });
      }
      if (r.ok && cap?.mode === 'edit' && r.changed?.length) {
        set(s => ({
          pendingLabels: [...s.pendingLabels, session.log.at(-1)?.label ?? capabilityTitle(cap)],
          lastChange: {
            label: session.log.at(-1)?.label ?? capabilityTitle(cap),
            actor: actor.kind,
            before,
            changed: r.changed!,
            areaChanges: r.areaChanges ?? [],
            warnings: r.warnings ?? [],
            at: Date.now(),
          },
          view: { ...s.view, highlight: r.changed! },
        }));
      } else if (r.ok && cap?.mode === 'edit' && session.project !== before) {
        // A change to no object (e.g. a look in the library) still names the next saved version
        set(s => ({ pendingLabels: [...s.pendingLabels, session.log.at(-1)?.label ?? capabilityTitle(cap)] }));
      }
      return r;
    },

    async preview(name, input) {
      const scratch = new Session(session.project);
      const r = await registry.call(name, input, { session: scratch, actor: { kind: 'user' }, host: host() });
      return r.ok ? scratch.project : null;
    },

    undo() {
      const e = session.undo();
      if (e)
        set(s => ({
          pendingLabels: [...s.pendingLabels, m.store_undo_label({ label: e.label })],
          view: { ...s.view, highlight: e.changed },
          lastChange: null,
        }));
    },

    redo() {
      const e = session.redo();
      if (e) set(s => ({ pendingLabels: [...s.pendingLabels, m.store_redo_label({ label: e.label })], view: { ...s.view, highlight: e.changed } }));
    },

    clearLookChange() {
      set({ lookChange: null });
    },
  };
};
