/** Look libraries from the API, as library files (packages/core/src/looks/library.ts) */
import type { LookLibrary } from '@plinth/core';
import type { LibraryDetail, LibraryLookInput, LibrarySummary } from '@/shared/looks';
import { api } from './api';

export const listLibraries = () => api<LibrarySummary[]>('/libraries');
export const getLibrary = (id: string) => api<LibraryDetail>(`/libraries/${id}`);

/** Save a look to a library: a new one, or a new version of `lookId` */
export const saveToLibrary = (library: string, look: LibraryLookInput, lookId?: string) =>
  api<{ look: string; version: string }>(lookId ? `/libraries/${library}/looks/${lookId}` : `/libraries/${library}/looks`, {
    method: lookId ? 'PUT' : 'POST',
    json: look,
  });

/** Current versions of looks copied from libraries (only the libraries the user can see) */
export const lookVersions = (refs: { library: string; look: string }[]) =>
  api<{ library: string; look: string; version: string; name: string; library_name: string }[]>('/libraries/versions', { method: 'POST', json: { refs } });

/** Import a library file as a new library of the user's */
export const importLibrary = (file: unknown) => api<{ id: string }>('/libraries/import', { method: 'POST', json: { file } });

/** Download a library as a file (`<id>.looklib.json`), like saving a font file */
export function downloadLibrary(lib: LookLibrary) {
  const { $schema: _s, ...file } = lib;
  const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2) + '\n'], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `${lib.id}.looklib.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
