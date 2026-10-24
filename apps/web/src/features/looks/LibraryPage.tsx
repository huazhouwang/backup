/**
 * A look library's page, the same for every library, like a font's specimen page: what the file says about it, its looks by
 * group (an index to jump to each group, then a section per group with a card per look), and its materials. Everything comes
 * from the library file (packages/core/src/looks/library.ts); nothing here knows one library from another. A look opens its own page
 * (looks.$libraryId_.$lookId.tsx).
 */
import { getRouteApi, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftIcon } from 'lucide-react';
import { SiteFooter, SiteHeader } from '@/features/site/SiteHeader';
import { Button } from '@/components/ui/button';
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { m } from '@/lib/i18n';
import { getLibrary } from '@/lib/libraries';
import { Library } from './LibraryContents';

const route = getRouteApi('/looks/$libraryId');

export function LibraryPage() {
  const { libraryId } = route.useParams();
  const detail = useQuery({ queryKey: ['library', libraryId], queryFn: () => getLibrary(libraryId) });
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-6">
        <Button variant="link" size="sm" className="h-auto px-0" nativeButton={false} render={<Link to="/looks" />}>
          <ArrowLeftIcon /> {m.libraries_back()}
        </Button>
        {detail.isLoading ? (
          <Skeleton className="h-40" />
        ) : !detail.data ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{detail.error?.message ?? m.server_err_library_not_found()}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <Library detail={detail.data} />
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
