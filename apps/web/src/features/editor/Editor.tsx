/**
 * Plan editor: chat on one side, canvas on the other. On phones the canvas is full screen and panels slide up from the bottom.
 * The page exposes window.artifact.call(capability, args) and a "ready" signal, so any agent can verify it with its own browser.
 */
import { describe } from '@opensu/core';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { m } from '@/lib/i18n';
import { removeCall } from './remove';
import { registry } from './agent/registry';
import { createEditorStore, EditorContext, type InitialProject } from './store';
import { Workspace } from './layout/Workspace';

declare global {
  interface Window {
    artifact?: {
      ready: boolean;
      call: (name: string, input?: unknown) => Promise<unknown>;
      capabilities: () => unknown[];
      project: () => unknown;
    };
  }
}

export function Editor({
  initial,
  search,
}: {
  initial: InitialProject;
  search: { level?: string; mode?: '2d' | '3d'; focus?: string; v?: number; start?: 'interview' };
}) {
  const store = useMemo(
    () =>
      createEditorStore(initial, {
        level: search.level,
        mode: search.mode,
        focus: search.focus?.split(',').filter(Boolean),
        interview: search.start === 'interview',
      }),
    [initial.id],
  );
  useEffect(() => store.getState().connect(), [store]);
  const navigate = useNavigate();

  // Open read-only when the link specifies a version
  useEffect(() => {
    if (search.v && search.v !== initial.version) void store.getState().loadVersion(search.v);
  }, []);

  // Browser automation interface
  useEffect(() => {
    window.artifact = {
      ready: true,
      call: (name, input) => store.getState().call(name, input ?? {}, { kind: 'external' }),
      capabilities: () => registry.list().map(describe),
      project: () => store.getState().project,
    };
    document.documentElement.dataset.artifactReady = 'true';
    window.dispatchEvent(new Event('artifact:ready'));
    return () => {
      delete window.artifact;
      delete document.documentElement.dataset.artifactReady;
    };
  }, [store]);

  // Write view state back to the URL so links share a specific floor and view
  useEffect(
    () =>
      store.subscribe((s, prev) => {
        if (s.view.level !== prev.view.level || s.view.mode !== prev.view.mode)
          void navigate({ to: '.', search: (old: any) => ({ ...old, level: s.view.level, mode: s.view.mode }), replace: true });
      }),
    [store],
  );

  // Shortcuts; save before leaving
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The target can be the document or window (no closest) when nothing has focus
      const t = e.target as Partial<HTMLElement> | null;
      if (t?.closest?.('input, textarea, [contenteditable]')) return;
      const s = store.getState();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (!s.canEdit()) return;
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (e.key === 'Escape') {
        if (s.placing) s.setPlacing(null);
        else if (s.sectioning) s.setSectioning(false);
        else if (s.camera3d.walking) s.setCamera3d({ walking: false });
        else s.select([]);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && s.canEdit() && s.view.selection.length) {
        // Delete the selection as one edit, by the same rules as the panel's buttons (bearing walls stay)
        const calls = s.view.selection.map(id => removeCall(s.project, id)).filter(c => c !== null);
        if (!calls.length) return;
        e.preventDefault();
        void (
          calls.length === 1 ? s.call(calls[0].name, calls[0].input) : s.call('batch', { label: m.editor_delete_label({ count: calls.length }), calls })
        ).then(r => {
          if (r.ok) s.select([]);
          else toast.error(r.error?.message ?? m.panels_action_failed());
        });
      } else if (e.key.toLowerCase() === 'r' && !e.metaKey && !e.ctrlKey && s.canEdit()) {
        // R turns the selected furniture a quarter turn
        const f = s.view.selection.length === 1 ? s.project.furniture.find(x => x.id === s.view.selection[0]) : undefined;
        if (f) void s.call('furniture_move', { furniture: f.id, rotation: (f.rotation + 90) % 360 });
      }
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') void store.getState().save();
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (store.getState().dirty) {
        void store.getState().save();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onUnload);
      void store.getState().save();
    };
  }, [store]);

  return (
    <EditorContext.Provider value={store}>
      <Workspace />
    </EditorContext.Provider>
  );
}
