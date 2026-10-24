/**
 * Look libraries as the API returns them: every library, built-in or the user's own, as a library file (packages/core/src/
 * library.ts) with who may do what to it (see migrations/0005_look_libraries.sql, 0006_library_files.sql)
 */
import type { LookLibrary, Recipe } from '@plinth/core';

export type LibraryRole = 'owner' | 'editor' | 'viewer';

export interface LibrarySummary {
  id: string;
  /** In the UI language */
  name: string;
  role: LibraryRole;
  owner_name: string;
  looks: number;
  updated_at: number;
  /** Shipped with the app; read-only for everyone */
  builtin?: boolean;
  /** The default library: what objects without a look of their own are drawn with */
  default?: boolean;
  /** The library's first look, drawn on its card like a font's sample text */
  cover?: { recipe: Recipe; size: { w: number; d: number; h: number } };
}

export interface LibraryDetail {
  /** The library file */
  library: LookLibrary;
  role: LibraryRole;
  builtin?: boolean;
  default?: boolean;
  members: { user_id: string; name: string; email: string; role: LibraryRole }[];
}

/** A look as a library stores it: the file's look without its version (the library sets it), with materials it brings */
export type LibraryLookInput = Omit<LookLibrary['looks'][string], 'version'> & { materials?: LookLibrary['materials'] };
