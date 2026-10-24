/** Sharing and permissions: members, share links, email invites, the plan's model, usage. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CopyIcon, LinkIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, roleLabel } from '@/lib/api';
import { SHARE_ROLES, type Role, type ShareRole } from '@/shared/roles';
import { m } from '@/lib/i18n';
import { useEditor, useEditorStore } from './store';

/** Select value for "follow the owner's default model" */
const USE_DEFAULT = 'default';

const ROLE_HINT: Record<ShareRole, () => string> = { viewer: m.share_hint_viewer, commenter: m.share_hint_commenter, editor: m.share_hint_editor };

interface Sharing {
  members: { user_id: string; role: Role; name: string; email: string; anonymous: number }[];
  links: { token: string; role: ShareRole; created_at: number }[];
  invites: { id: string; email: string; role: ShareRole }[];
}

function RoleSelect({ value, onChange }: { value: ShareRole; onChange: (r: ShareRole) => void }) {
  return (
    <Select value={value} onValueChange={v => onChange(v as ShareRole)}>
      <SelectTrigger size="sm" className="w-28">
        <SelectValue>{roleLabel(value)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {SHARE_ROLES.map(r => (
          <SelectItem key={r} value={r}>
            <div className="flex flex-col">
              <span>{roleLabel(r)}</span>
              <span className="text-xs text-muted-foreground">{ROLE_HINT[r]()}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ShareDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const projectId = useEditor(s => s.projectId);
  const role = useEditor(s => s.role);
  const models = useEditor(s => s.models);
  const projectModelId = useEditor(s => s.projectModelId);
  const defaultModel = useEditor(s => s.models.find(x => x.id === s.defaultModelId));
  const store = useEditorStore();
  const qc = useQueryClient();
  const owner = role === 'owner';
  const [linkRole, setLinkRole] = useState<ShareRole>('commenter');
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<ShareRole>('editor');

  const sharing = useQuery({ queryKey: ['sharing', projectId], queryFn: () => api<Sharing>(`/projects/${projectId}/sharing`), enabled: open });
  const usage = useQuery({
    queryKey: ['usage', projectId],
    queryFn: () => api<{ user_id: string; name: string; input: number; output: number; calls: number }[]>(`/projects/${projectId}/usage`),
    enabled: open && owner,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['sharing', projectId] });
  const fail = (e: Error) => toast.error(e.message);

  const createLink = useMutation({
    mutationFn: () => api<{ token: string }>(`/projects/${projectId}/links`, { method: 'POST', json: { role: linkRole } }),
    onSuccess: r => {
      void refresh();
      copy(r.token);
    },
    onError: fail,
  });
  const revoke = useMutation({ mutationFn: (t: string) => api(`/projects/${projectId}/links/${t}`, { method: 'DELETE' }), onSuccess: refresh, onError: fail });
  const invite = useMutation({
    mutationFn: () => api(`/projects/${projectId}/invites`, { method: 'POST', json: { email, role: inviteRole } }),
    onSuccess: () => {
      setEmail('');
      void refresh();
      toast.success(m.share_invited());
    },
    onError: fail,
  });
  const delInvite = useMutation({ mutationFn: (id: string) => api(`/projects/${projectId}/invites/${id}`, { method: 'DELETE' }), onSuccess: refresh });
  const setRole = useMutation({
    mutationFn: (v: { userId: string; role: ShareRole }) => api(`/projects/${projectId}/members/${v.userId}`, { method: 'PATCH', json: { role: v.role } }),
    onSuccess: refresh,
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: (userId: string) => api(`/projects/${projectId}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: refresh,
    onError: fail,
  });
  const pickModel = useMutation({
    mutationFn: (id: string | null) => api(`/projects/${projectId}/model`, { method: 'PUT', json: { modelConfigId: id } }),
    onSuccess: (_r, id) => {
      const picked = models.find(x => x.id === id);
      store.setState({ projectModelId: picked?.id ?? null });
      toast.success(picked ? m.share_model_switched({ label: picked.label }) : m.share_model_cleared());
    },
    onError: fail,
  });

  const copy = (token: string) => {
    const url = `${location.origin}/s/${token}`;
    void navigator.clipboard?.writeText(url).then(
      () => toast.success(m.share_link_copied()),
      () => toast.message(url),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{m.share_title()}</DialogTitle>
          <DialogDescription>{m.share_description()}</DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <h4 className="text-sm font-medium">{m.share_members()}</h4>
          <ul className="space-y-1.5">
            {sharing.data?.members.map(mb => (
              <li key={mb.user_id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  {mb.anonymous ? m.share_guest() : mb.name || mb.email}
                  <span className="ml-1 text-xs text-muted-foreground">{mb.anonymous ? '' : mb.email}</span>
                </span>
                {mb.role === 'owner' || !owner ? (
                  <span className="text-xs text-muted-foreground">{roleLabel(mb.role)}</span>
                ) : (
                  <span className="flex items-center gap-1">
                    <RoleSelect value={mb.role as ShareRole} onChange={r => setRole.mutate({ userId: mb.user_id, role: r })} />
                    <Button size="icon-sm" variant="ghost" aria-label={m.share_remove()} onClick={() => remove.mutate(mb.user_id)}>
                      <Trash2Icon />
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>

        {owner && (
          <>
            <Separator />
            <section className="space-y-2">
              <h4 className="text-sm font-medium">{m.share_links()}</h4>
              <div className="flex gap-2">
                <RoleSelect value={linkRole} onChange={setLinkRole} />
                <Button size="sm" onClick={() => createLink.mutate()} disabled={createLink.isPending}>
                  <LinkIcon /> {m.share_create_link()}
                </Button>
              </div>
              <ul className="space-y-1">
                {sharing.data?.links.map(l => (
                  <li key={l.token} className="flex items-center justify-between text-sm">
                    <span className="font-mono text-xs text-muted-foreground">
                      …/s/{l.token.slice(0, 8)}…{m.share_link_role_suffix({ role: roleLabel(l.role) })}
                    </span>
                    <span>
                      <Button size="icon-sm" variant="ghost" aria-label={m.share_copy()} onClick={() => copy(l.token)}>
                        <CopyIcon />
                      </Button>
                      <Button size="xs" variant="ghost" onClick={() => revoke.mutate(l.token)}>
                        {m.share_revoke_link()}
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <Separator />
            <section className="space-y-2">
              <h4 className="text-sm font-medium">{m.share_invite_by_email()}</h4>
              <form
                className="flex gap-2"
                onSubmit={e => {
                  e.preventDefault();
                  if (email) invite.mutate();
                }}
              >
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={m.share_email_placeholder()} className="h-8" />
                <RoleSelect value={inviteRole} onChange={setInviteRole} />
                <Button size="sm" type="submit" disabled={!email || invite.isPending}>
                  {m.share_invite()}
                </Button>
              </form>
              <ul className="space-y-1">
                {sharing.data?.invites.map(i => (
                  <li key={i.id} className="flex items-center justify-between text-sm">
                    <span>
                      {i.email}
                      {m.share_invite_pending({ role: roleLabel(i.role) })}
                    </span>
                    <Button size="xs" variant="ghost" onClick={() => delInvite.mutate(i.id)}>
                      {m.share_cancel_invite()}
                    </Button>
                  </li>
                ))}
              </ul>
            </section>

            <Separator />
            <section className="space-y-2">
              <h4 className="text-sm font-medium">{m.share_model_title()}</h4>
              {models.length ? (
                <Select value={projectModelId ?? USE_DEFAULT} onValueChange={v => pickModel.mutate(v === USE_DEFAULT ? null : (v as string))}>
                  <SelectTrigger size="sm" className="w-full">
                    <SelectValue>
                      {models.find(x => x.id === projectModelId)?.label ?? m.share_model_use_default({ label: defaultModel?.label ?? '' })}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={USE_DEFAULT}>{m.share_model_use_default({ label: defaultModel?.label ?? '' })}</SelectItem>
                    {models.map(x => (
                      <SelectItem key={x.id} value={x.id}>
                        {x.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {m.share_no_models_before()}
                  <Button variant="link" className="h-auto p-0" nativeButton={false} render={<Link to="/settings" />}>
                    {m.share_settings()}
                  </Button>
                  {m.share_no_models_after()}
                </p>
              )}
              <p className="text-xs text-muted-foreground">{m.share_key_note()}</p>
              {usage.data && usage.data.length > 0 && (
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{m.share_usage_who()}</TableHead>
                      <TableHead className="text-right">{m.share_usage_calls()}</TableHead>
                      <TableHead className="text-right">{m.share_usage_input()}</TableHead>
                      <TableHead className="text-right">{m.share_usage_output()}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="font-mono">
                    {usage.data.map(u => (
                      <TableRow key={u.user_id}>
                        <TableCell className="font-sans">{u.name || m.share_guest()}</TableCell>
                        <TableCell className="text-right">{u.calls}</TableCell>
                        <TableCell className="text-right">{u.input.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{u.output.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
