import { getRouteApi, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Editor } from '@/features/editor/Editor';
import type { InitialProject } from '@/features/editor/store';
import { api, ApiError } from '@/lib/api';
import { m } from '@/lib/i18n';

const route = getRouteApi('/p/$projectId');

export function ProjectPage() {
  const { projectId } = route.useParams();
  const search = route.useSearch();
  const q = useQuery({ queryKey: ['project', projectId], queryFn: () => api<InitialProject>(`/projects/${projectId}`), staleTime: Infinity, gcTime: 0 });
  if (q.isLoading) {
    return (
      <div className="flex h-dvh flex-col">
        <div className="h-12 border-b" />
        <div className="flex flex-1">
          <Skeleton className="m-4 flex-1" />
          <div className="w-[380px] border-l max-md:hidden" />
        </div>
      </div>
    );
  }
  if (q.error || !q.data) {
    const status = q.error instanceof ApiError ? q.error.status : 0;
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-lg font-medium">{status === 401 ? m.project_page_sign_in_first() : m.project_page_cannot_open()}</p>
        <p className="text-sm text-muted-foreground">{q.error?.message}</p>
        <div className="flex gap-2">
          {status === 401 ? (
            <Button nativeButton={false} render={<Link to="/login" search={{ redirect: `/p/${projectId}` }} />}>
              {m.project_page_sign_in()}
            </Button>
          ) : (
            <Button nativeButton={false} render={<Link to="/projects" />}>
              {m.project_page_back_to_projects()}
            </Button>
          )}
        </div>
      </div>
    );
  }
  return <Editor initial={q.data} search={search} />;
}
