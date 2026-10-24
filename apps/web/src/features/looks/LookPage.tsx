/**
 * A look's page in its library, like a component's page in Storybook: a large still with controls for its parameters and size
 * (the same controls as the properties panel), then its variants, one parameter at a time with the others at their defaults,
 * and the size narrower and wider. Everything is generated from the look's declarations (lib/variants.ts).
 */
import { getRouteApi, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftIcon } from 'lucide-react';
import { SiteFooter, SiteHeader } from '@/features/site/SiteHeader';
import { Button } from '@/components/ui/button';
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { m, uiName } from '@/lib/i18n';
import { getLibrary } from '@/lib/libraries';

import { Look } from './LookDetails';

const route = getRouteApi('/looks/$libraryId_/$lookId');

export function LookPage() {
  const { libraryId, lookId } = route.useParams();
  const detail = useQuery({ queryKey: ['library', libraryId], queryFn: () => getLibrary(libraryId) });
  const lib = detail.data?.library,
    look = lib?.looks[lookId];
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-6">
        <Button variant="link" size="sm" className="h-auto px-0" nativeButton={false} render={<Link to="/looks/$libraryId" params={{ libraryId }} />}>
          <ArrowLeftIcon /> {lib ? uiName(lib.name) : m.libraries_back()}
        </Button>
        {detail.isLoading ? (
          <Skeleton className="h-96" />
        ) : lib && look ? (
          <Look key={lookId} lib={lib} look={look} />
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{detail.error?.message ?? m.agent_err_look_not_found({ look: lookId })}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
