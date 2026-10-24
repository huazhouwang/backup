/** What the capabilities reach outside the project through the editor: look libraries, look previews and comments, via the API */
import type { LibrariesHost } from '../agent/library-capabilities';
import type { LooksHost } from '../agent/look-capabilities';
import type { CommentsHost } from '../agent/view-capabilities';
import { api } from '@/lib/api';
import { m } from '@/lib/i18n';
import { getLibrary, listLibraries, saveToLibrary } from '@/lib/libraries';
import { queryClient } from '@/lib/query';

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
