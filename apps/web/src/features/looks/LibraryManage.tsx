import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Trash2Icon, UserPlusIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import { m, uiName } from '@/lib/i18n';
import { useMe } from '@/lib/query';
import type { LibraryDetail, LibraryRole } from '@/shared/looks';
import { libraryRoleLabel } from './library-role';

/** A look library's settings */
export function LibraryManage({ detail }: { detail: LibraryDetail }) {
  return (
    <LibraryAdmin
      lib={{
        id: detail.library.id,
        name: uiName(detail.library.name),
        role: detail.role,
        members: detail.members,
        items: Object.entries(detail.library.looks).map(([id, k]) => ({ id, name: uiName(k.name), version: k.version })),
      }}
      kind="looks"
    />
  );
}

/** A library as its settings need it: look and widget libraries alike */
export interface AdminLibrary {
  id: string;
  name: string;
  role: LibraryRole;
  members: LibraryDetail['members'];
  items: { id: string; name: string; version: string }[];
}

/** Where each kind of library lives in the API, the query cache and the site, and how the UI names it */
const KINDS = {
  looks: {
    base: '/libraries',
    itemsPath: 'looks',
    queryKeys: { list: 'libraries', detail: 'library' },
    back: '/looks',
    text: {
      removeItem: (name: string) => m.libraries_remove_look({ name }),
      name: () => m.libraries_name(),
      remove: () => m.libraries_delete(),
      removeTitle: (name: string) => m.libraries_delete_title({ name }),
      removeDescription: () => m.libraries_delete_description(),
      leave: () => m.libraries_leave(),
    },
  },
  widgets: {
    base: '/widget-libraries',
    itemsPath: 'widgets',
    queryKeys: { list: 'widget-libraries', detail: 'widget-library' },
    back: '/widgets',
    text: {
      removeItem: (name: string) => m.widget_libraries_remove_widget({ name }),
      name: () => m.widget_libraries_name(),
      remove: () => m.widget_libraries_delete(),
      removeTitle: (name: string) => m.widget_libraries_delete_title({ name }),
      removeDescription: () => m.widget_libraries_delete_description(),
      leave: () => m.widget_libraries_leave(),
    },
  },
} as const;

/**
 * Rename, items (looks or widgets), members and sharing, delete or leave: what the viewer's role allows on a library of their own
 * or shared with them
 */
export function LibraryAdmin({ lib, kind }: { lib: AdminLibrary; kind: keyof typeof KINDS }) {
  const { base, itemsPath, queryKeys, back, text } = KINDS[kind];
  const looks = lib.items;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const me = useMe();
  const userId = me.data?.user?.id;
  const owner = lib.role === 'owner',
    editor = owner || lib.role === 'editor';
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'viewer' | 'editor'>('viewer');
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: [queryKeys.list] }), qc.invalidateQueries({ queryKey: [queryKeys.detail, lib.id] })]);
  const call = (path: string, init: Parameters<typeof api>[1]) =>
    api(path, init)
      .then(refresh)
      .catch((e: Error) => toast.error(e.message));
  const gone = () =>
    api(lib.role === 'owner' ? `${base}/${lib.id}` : `${base}/${lib.id}/members/${userId}`, { method: 'DELETE' })
      .then(() => qc.invalidateQueries({ queryKey: [queryKeys.list] }))
      .then(() => navigate({ to: back }))
      .catch((e: Error) => toast.error(e.message));
  return (
    <div className="space-y-5">
      {owner && (
        <Input
          defaultValue={lib.name}
          aria-label={text.name()}
          onBlur={e =>
            e.target.value.trim() && e.target.value !== lib.name && void call(`${base}/${lib.id}`, { method: 'PATCH', json: { name: e.target.value.trim() } })
          }
        />
      )}
      {looks.length > 0 && (
        <ItemGroup className="gap-1">
          {looks.map(k => (
            <Item key={k.id} size="xs" variant="outline">
              <ItemContent>
                <ItemTitle>{k.name}</ItemTitle>
                <ItemDescription>v{k.version}</ItemDescription>
              </ItemContent>
              {editor && (
                <ItemActions>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={text.removeItem(k.name)}
                    onClick={() => void call(`${base}/${lib.id}/${itemsPath}/${k.id}`, { method: 'DELETE' })}
                  >
                    <Trash2Icon />
                  </Button>
                </ItemActions>
              )}
            </Item>
          ))}
        </ItemGroup>
      )}
      <div className="space-y-2">
        <p className="text-sm font-medium">{m.libraries_members()}</p>
        <ItemGroup className="gap-1">
          {lib.members.map(u => (
            <Item key={u.user_id} size="xs" variant="outline">
              <ItemContent>
                <ItemTitle>{u.name || u.email}</ItemTitle>
                <ItemDescription>
                  {u.email} · {libraryRoleLabel(u.role)}
                </ItemDescription>
              </ItemContent>
              {owner && u.role !== 'owner' && (
                <ItemActions>
                  <Button size="xs" variant="ghost" onClick={() => void call(`${base}/${lib.id}/members/${u.user_id}`, { method: 'DELETE' })}>
                    {m.libraries_remove_member()}
                  </Button>
                </ItemActions>
              )}
            </Item>
          ))}
        </ItemGroup>
        {owner && (
          <form
            className="flex flex-wrap gap-2"
            onSubmit={e => {
              e.preventDefault();
              if (email) void call(`${base}/${lib.id}/members`, { method: 'POST', json: { email, role } }).then(() => setEmail(''));
            }}
          >
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder={m.libraries_share_placeholder()}
              aria-label={m.libraries_share_placeholder()}
              className="min-w-0 flex-1"
            />
            <Select value={role} onValueChange={v => setRole(v as 'viewer' | 'editor')}>
              <SelectTrigger className="w-32" aria-label={m.libraries_share_role()}>
                <SelectValue>{libraryRoleLabel(role)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">{libraryRoleLabel('viewer')}</SelectItem>
                <SelectItem value="editor">{libraryRoleLabel('editor')}</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" variant="outline" disabled={!email}>
              <UserPlusIcon /> {m.libraries_share()}
            </Button>
          </form>
        )}
      </div>
      {owner ? (
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="outline" size="sm" className="text-destructive" />}>
            <Trash2Icon /> {text.remove()}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{text.removeTitle(lib.name)}</AlertDialogTitle>
              <AlertDialogDescription>{text.removeDescription()}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{m.settings_cancel()}</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => void gone()}>
                {m.settings_delete()}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <Button variant="outline" size="sm" disabled={!userId} onClick={() => void gone()}>
          {text.leave()}
        </Button>
      )}
    </div>
  );
}
