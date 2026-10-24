import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { EllipsisIcon, HouseIcon, PlusIcon, UserIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SiteFooter, SiteHeader } from '@/features/site/SiteHeader';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia } from '@/components/ui/item';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api, roleLabel } from '@/lib/api';
import type { Role } from '@/shared/roles';
import { m } from '@/lib/i18n';
import { fmtTime, useMe } from '@/lib/query';
import { NewProject } from './NewProjectDialog';

interface Row {
  id: string;
  name: string;
  head_version: number;
  thumbnail: string | null;
  updated_at: number;
  role: Role;
  owner_name: string;
}

export function ProjectsPage() {
  const me = useMe();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [newName, setNewName] = useState('');
  const user = me.data?.user;

  useEffect(() => {
    if (me.isSuccess && !user) void navigate({ to: '/login', search: { redirect: '/projects' } });
  }, [me.isSuccess, user]);

  const list = useQuery({ queryKey: ['projects'], queryFn: () => api<Row[]>('/projects'), enabled: !!user });
  const rename = useMutation({
    mutationFn: (r: Row) => api(`/projects/${r.id}`, { method: 'PATCH', json: { name: newName } }),
    onSuccess: () => {
      setRenaming(null);
      void qc.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: e => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (r: Row) => api(`/projects/${r.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setDeleting(null);
      void qc.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: e => toast.error(e.message),
  });
  const leave = useMutation({
    mutationFn: (r: Row) => api(`/projects/${r.id}/members/${user!.id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {user?.isAnonymous && (
          <Item variant="outline" className="mb-6">
            <ItemMedia variant="icon">
              <UserIcon />
            </ItemMedia>
            <ItemContent>
              <ItemDescription className="text-foreground">{m.projects_guest_notice()}</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button size="sm" nativeButton={false} render={<Link to="/login" search={{ redirect: '/projects' }} />}>
                {m.projects_sign_in_to_save()}
              </Button>
            </ItemActions>
          </Item>
        )}
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">{m.projects_title()}</h1>
          <Button size="sm" onClick={() => setCreating(true)}>
            <PlusIcon /> {m.projects_new()}
          </Button>
        </div>
        {list.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map(i => (
              <Skeleton key={i} className="h-52" />
            ))}
          </div>
        ) : !list.data?.length ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HouseIcon />
              </EmptyMedia>
              <EmptyTitle>{m.projects_empty_title()}</EmptyTitle>
              <EmptyDescription>{m.projects_empty_description()}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => setCreating(true)}>
                <PlusIcon /> {m.projects_new()}
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.data.map(r => (
              <li key={r.id}>
                <Card className="relative gap-0 overflow-hidden py-0">
                  <Link to="/p/$projectId" params={{ projectId: r.id }} className="block">
                    {r.thumbnail?.startsWith('data:image/') ? (
                      // A still of the house in 3D, filling the frame
                      <img src={r.thumbnail} alt="" className="aspect-[4/3] w-full object-cover" />
                    ) : (
                      <div className="flex aspect-[4/3] items-center justify-center bg-card p-3">
                        {r.thumbnail ? (
                          <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(r.thumbnail)}`} alt="" className="max-h-full max-w-full" />
                        ) : (
                          <HouseIcon className="size-8 text-muted-foreground" />
                        )}
                      </div>
                    )}
                    <CardHeader className="rounded-t-none border-t px-3 py-2">
                      <CardTitle className="truncate text-sm">{r.name}</CardTitle>
                      <CardDescription className="text-xs">
                        {r.role === 'owner'
                          ? m.projects_mine()
                          : m.projects_shared_by({ owner: r.owner_name || m.projects_someone(), role: roleLabel(r.role) })}{' '}
                        · {m.projects_version({ version: r.head_version })} · {fmtTime(r.updated_at)}
                      </CardDescription>
                    </CardHeader>
                  </Link>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="secondary" size="icon-sm" className="absolute top-2 right-2" aria-label={m.projects_more()} />}
                    >
                      <EllipsisIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {r.role !== 'viewer' && r.role !== 'commenter' && (
                        <DropdownMenuItem
                          onClick={() => {
                            setNewName(r.name);
                            setRenaming(r);
                          }}
                        >
                          {m.projects_rename()}
                        </DropdownMenuItem>
                      )}
                      {r.role === 'owner' ? (
                        <DropdownMenuItem variant="destructive" onClick={() => setDeleting(r)}>
                          {m.projects_delete()}
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => leave.mutate(r)}>{m.projects_leave()}</DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </main>
      <SiteFooter />
      <NewProject open={creating} onOpenChange={setCreating} />
      <Dialog open={!!renaming} onOpenChange={o => !o && setRenaming(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{m.projects_rename()}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={e => {
              e.preventDefault();
              renaming && rename.mutate(renaming);
            }}
            className="space-y-4"
          >
            <Input value={newName} onChange={e => setNewName(e.target.value)} maxLength={60} required autoFocus />
            <DialogFooter>
              <Button type="submit" disabled={rename.isPending}>
                {m.projects_save()}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!deleting} onOpenChange={o => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{m.projects_delete_title({ name: deleting?.name ?? '' })}</AlertDialogTitle>
            <AlertDialogDescription>{m.projects_delete_description()}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.projects_cancel()}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => deleting && del.mutate(deleting)}>
              {m.projects_delete()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
