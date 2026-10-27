/**
 * The widget libraries the user can use (their own and shared ones), registered in core so their widgets can be installed and
 * their newer versions offered; built-in ones are always there. Each keeps its owner, which decides its realm in the sandbox.
 */
import { registerWidgetLibrary, unregisterWidgetLibrary } from '@opensu/core';
import { useQuery } from '@tanstack/react-query';
import { useMe } from '@/lib/query';
import { widgetLibraryFiles } from '@/lib/widget-libraries';

let registered = new Set<string>();

export function useWidgetLibraries() {
  const me = useMe();
  const userId = me.data?.user?.id;
  return useQuery({
    queryKey: ['widget-library-files', userId],
    enabled: !!userId,
    retry: false,
    queryFn: async () => {
      const files = await widgetLibraryFiles();
      const now = new Set<string>();
      for (const f of files) {
        registerWidgetLibrary(
          f.owner === userId ? { origin: 'user', owner: f.owner, id: f.library.id } : { origin: 'team', owner: f.owner, id: f.library.id },
          f.library,
        );
        now.add(f.library.id);
      }
      for (const id of registered) if (!now.has(id)) unregisterWidgetLibrary(id);
      registered = now;
      return files;
    },
  });
}
