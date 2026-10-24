/**
 * Built-in look libraries (libraries/*.looklib.json, loaded by @plinth/core) served like libraries every user can view, as the
 * same library files the API returns for user libraries
 */
import { BUILTIN_LIBRARIES, builtinLibrary, DEFAULT_LIBRARY_ID, libraryRecipe, lookSizeOf } from '@plinth/core';
import { uiName } from '@/lib/i18n';
import type { LibraryDetail, LibrarySummary } from '@/shared/looks';

export const isBuiltinLibrary = (id: string) => !!builtinLibrary(id);

export const builtinSummaries = (): LibrarySummary[] =>
  BUILTIN_LIBRARIES.map(l => {
    const first = Object.values(l.looks)[0];
    return {
      id: l.id,
      name: uiName(l.name),
      role: 'viewer',
      owner_name: l.author ?? 'Plinth',
      looks: Object.keys(l.looks).length,
      updated_at: 0,
      builtin: true,
      ...(l.id === DEFAULT_LIBRARY_ID ? { default: true } : {}),
      ...(first ? { cover: { recipe: libraryRecipe(l, first), size: lookSizeOf(first) } } : {}),
    };
  });

export function builtinDetail(id: string): LibraryDetail | null {
  const l = builtinLibrary(id);
  return l ? { library: l, role: 'viewer', builtin: true, members: [], ...(id === DEFAULT_LIBRARY_ID ? { default: true } : {}) } : null;
}

/** Current versions of built-in looks among `refs` */
export function builtinVersions(refs: { library: string; look: string }[]) {
  return refs.flatMap(r => {
    const l = builtinLibrary(r.library),
      k = l?.looks[r.look];
    return l && k ? [{ library: l.id, look: r.look, version: k.version, name: uiName(k.name), library_name: uiName(l.name) }] : [];
  });
}
