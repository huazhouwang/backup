/**
 * Look libraries, like a font book: the default library (what objects without a look of their own are drawn with), the built-in
 * ones, and the user's own and shared libraries in one list. Each opens the same page (looks.$libraryId.tsx).
 */
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ShapesIcon } from 'lucide-react';
import { LibraryBadge } from './LibraryBadge';
import { LibraryCreate } from './LibraryCreate';
import { LibraryImport } from './LibraryImport';
import { LookStill } from '@/features/looks/LookStill';
import { SiteFooter, SiteHeader } from '@/features/site/SiteHeader';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { m } from '@/lib/i18n';
import { listLibraries } from '@/lib/libraries';
import type { LibrarySummary } from '@/shared/looks';

export function LibrariesPage() {
  const libs = useQuery({ queryKey: ['libraries'], queryFn: listLibraries });
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-4 px-4 py-6">
        <div>
          <h1 className="text-xl font-semibold">{m.nav_libraries()}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{m.libraries_page_description()}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LibraryCreate />
          <LibraryImport />
        </div>
        {libs.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map(i => (
              <Skeleton key={i} className="h-60" />
            ))}
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {libs.data?.map(l => (
              <li key={l.id}>
                <LibraryCard lib={l} />
              </li>
            ))}
          </ul>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

function LibraryCard({ lib }: { lib: LibrarySummary }) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <Link to="/looks/$libraryId" params={{ libraryId: lib.id }} className="block" aria-label={m.libraries_open({ name: lib.name })}>
        <Preview lib={lib} />
        <CardHeader className="rounded-t-none border-t px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="truncate text-sm">{lib.name}</CardTitle>
            <LibraryBadge lib={lib} />
          </div>
          <CardDescription className="text-xs">
            {m.libraries_count({ count: lib.looks })} · {lib.default ? m.libraries_default_hint() : m.libraries_owner({ name: lib.owner_name })}
          </CardDescription>
        </CardHeader>
      </Link>
    </Card>
  );
}

/** A still of the library's first look, like a font's sample text, drawn like every other look */
function Preview({ lib }: { lib: LibrarySummary }) {
  if (lib.cover) return <LookStill single bleed recipe={lib.cover.recipe} size={lib.cover.size} alt="" />;
  return (
    <div className="flex aspect-[4/3] items-center justify-center bg-card">
      <ShapesIcon className="size-8 text-muted-foreground" />
    </div>
  );
}
