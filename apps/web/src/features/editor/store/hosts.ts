/** What the capabilities reach outside the project through the editor: look libraries, look previews and comments, via the API */
import type { LibrariesHost, WidgetsHost } from '../agent/library-capabilities';
import type { LooksHost } from '../agent/look-capabilities';
import type { RendersHost } from '../agent/render-capabilities';
import type { CommentsHost } from '../agent/view-capabilities';
import { api } from '@/lib/api';
import { m } from '@/lib/i18n';
import { getLibrary, listLibraries, saveToLibrary } from '@/lib/libraries';
import { queryClient } from '@/lib/query';
import { createWidgetLibrary, listWidgetLibraries, saveWidget } from '@/lib/widget-libraries';
import { installMyWidget, type MyWidgets, type WidgetDef } from '@opensu/core';

/** Capabilities that add or change a look: the chat shows it with a preview */
export const LOOK_EDITS = new Set(['look_add', 'look_update', 'furniture_type_add']);

/** Look libraries for the agent, through the API as the user */
export const librariesHost: LibrariesHost = { list: listLibraries, get: getLibrary, save: (lib, look, id) => saveToLibrary(lib, look, id) };

/** Draws look previews for the agent's self-check and the chat (three.js loads on demand) */
export const looksHost: LooksHost = { preview: async (recipe, size) => (await import('@/graphics/three/look-preview')).renderLookPreview(recipe, size) };

/** Agent reads/writes comments via the server API and refreshes the comments panel after replying */
export function commentsHost(projectId: string): CommentsHost {
  return {
    list: () => api(`/projects/${projectId}/comments`),
    async reply(parentId, body, status) {
      await api(`/projects/${projectId}/comments`, { method: 'POST', json: { body: m.store_agent_comment({ body }), parentId } });
      if (status) await api(`/projects/${projectId}/comments/${parentId}`, { method: 'PATCH', json: { status } });
      await queryClient.invalidateQueries({ queryKey: ['comments', projectId] });
    },
  };
}

/** Style renders for the agent: made like the styles panel makes them, which then lists them */
export function rendersHost(projectId: string): RendersHost {
  return {
    async render(project, style, shots) {
      const { renderStyle, shotsFor } = await import('@/features/renders/renders');
      try {
        return await renderStyle(projectId, project, style, shotsFor(project, shots));
      } finally {
        await queryClient.invalidateQueries({ queryKey: ['renders', projectId] });
        await queryClient.invalidateQueries({ queryKey: ['credits'] });
      }
    },
  };
}

/** Saving the design's own widgets for reuse (issue 204): into the user's widget library (one made when they have none), and for them */
// Saves run one at a time, so two in parallel make one new library between them, not two
let saving: Promise<unknown> = Promise.resolve();

export const widgetsHost: WidgetsHost = {
  save(id, def, library) {
    const run = saving.then(() => saveOne(id, def, library));
    saving = run.catch(() => {});
    return run;
  },
  async installForMe(library, widget, params, language) {
    const set = await api<MyWidgets>('/me/widgets');
    const next = installMyWidget(set, library, widget, language, params);
    await api('/me/widgets', { method: 'PUT', json: next });
    queryClient.setQueriesData({ queryKey: ['my-widgets'] }, next);
  },
};

async function saveOne(id: string, def: WidgetDef, library?: string) {
  const libs = (await listWidgetLibraries()).filter(l => !l.builtin && l.role !== 'viewer');
  const target = library ? libs.find(l => l.id === library) : libs[0];
  if (library && !target) throw new Error(m.agent_err_widget_library({ library }));
  const lib = target ?? { id: (await createWidgetLibrary(m.widgets_default_library())).id, name: m.widgets_default_library() };
  const r = await saveWidget(lib.id, id, def);
  // The library's new version, registered so it can be installed at once
  await queryClient.refetchQueries({ queryKey: ['widget-library-files'] });
  return { library: lib.id, libraryName: lib.name, widget: r.widget, version: r.version };
}
