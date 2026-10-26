/**
 * Widget libraries: the built-in ones and the user's own and shared ones in one list, like the look libraries next to them.
 * Each opens the same page (widgets.$libraryId.tsx).
 */
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { LibraryBadge } from '@/features/looks/LibraryBadge';
import { LibraryCreate } from '@/features/looks/LibraryCreate';
import { LibraryImport } from '@/features/looks/LibraryImport';
import { SiteFooter, SiteHeader } from '@/features/site/SiteHeader';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { m } from '@/lib/i18n';
import { listWidgetLibraries } from '@/lib/widget-libraries';

export function WidgetLibrariesPage() {
  const libs = useQuery({ queryKey: ['widget-libraries'], queryFn: listWidgetLibraries });
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-4 px-4 py-6">
        <div>
          <h1 className="text-xl font-semibold">{m.nav_widget_libraries()}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{m.widget_libraries_page_description()}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LibraryCreate widgets />
          <LibraryImport widgets />
        </div>
        {libs.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map(i => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {libs.data?.map(l => (
              <li key={l.id}>
                <Card size="sm">
                  <Link to="/widgets/$libraryId" params={{ libraryId: l.id }} aria-label={m.libraries_open({ name: l.name })}>
                    <CardHeader>
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="truncate text-sm">{l.name}</CardTitle>
                        <LibraryBadge lib={l} />
                      </div>
                      <CardDescription className="text-xs">
                        {m.widget_libraries_count({ count: l.widgets })} · {m.libraries_owner({ name: l.owner_name })}
                      </CardDescription>
                    </CardHeader>
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
