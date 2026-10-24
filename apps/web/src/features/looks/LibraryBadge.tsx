import { Badge } from '@/components/ui/badge';
import { m } from '@/lib/i18n';
import type { LibrarySummary } from '@/shared/looks';
import { libraryRoleLabel } from './library-role';

/** Default, built-in, or the viewer's role */
export function LibraryBadge({ lib }: { lib: Pick<LibrarySummary, 'role' | 'builtin' | 'default'> }) {
  return (
    <Badge variant={lib.default ? 'default' : 'secondary'}>
      {lib.default ? m.libraries_default() : lib.builtin ? m.libraries_builtin() : libraryRoleLabel(lib.role)}
    </Badge>
  );
}
