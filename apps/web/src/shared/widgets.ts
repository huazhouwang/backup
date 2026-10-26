/**
 * Widget libraries as the API returns them: built-in ones (shipped with the app) and users' own and shared ones, as widget
 * library files (packages/core/src/widgets/format.ts) with who may do what to them (migrations/0007_widget_libraries.sql)
 */
import type { WidgetDef, WidgetLibrary } from '@plinth/core';
import type { LibraryRole } from './looks';

export interface WidgetLibrarySummary {
  id: string;
  /** In the UI language */
  name: string;
  role: LibraryRole;
  owner_name: string;
  widgets: number;
  updated_at: number;
  /** Shipped with the app; read-only for everyone */
  builtin?: boolean;
}

export interface WidgetLibraryDetail {
  library: WidgetLibrary;
  role: LibraryRole;
  builtin?: boolean;
  members: { user_id: string; name: string; email: string; role: LibraryRole }[];
}

/** A widget library the user can use, for the editor to make its widgets installable */
export interface WidgetLibraryFile {
  /** The owner's user id: the library's realm in the sandbox is theirs */
  owner: string;
  role: LibraryRole;
  library: WidgetLibrary;
}

/** Saving a widget into a library */
export interface WidgetSave {
  def: WidgetDef;
}
