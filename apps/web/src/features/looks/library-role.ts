import { m } from '@/lib/i18n';
import type { LibraryRole } from '@/shared/looks';

/** A library role as the UI names it */
export const libraryRoleLabel = (r: LibraryRole) =>
  r === 'owner' ? m.libraries_role_owner() : r === 'editor' ? m.libraries_role_editor() : m.libraries_role_viewer();
