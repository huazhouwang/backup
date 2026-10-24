/** Comment threads on the project and its objects */
import { findObject } from '@plinth/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, MessageSquareIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { m } from '@/lib/i18n';
import { fmtTime } from '@/lib/query';
import type { CommentRow, CommentStatus } from '@/shared/comments';
import { can } from '@/shared/roles';
import { useEditor } from '../store';

const STATUS: Record<CommentStatus, () => string> = {
  open: m.panels_status_open,
  'pending-confirm': m.panels_status_pending_confirm,
  resolved: m.panels_status_resolved,
};

export function CommentsPanel() {
  const projectId = useEditor(s => s.projectId);
  const role = useEditor(s => s.role);
  const target = useEditor(s => s.view.selection[0]);
  const project = useEditor(s => s.project);
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const { data = [] } = useQuery({
    queryKey: ['comments', projectId],
    queryFn: () => api<CommentRow[]>(`/projects/${projectId}/comments`),
    refetchInterval: 30_000,
  });
  const targetName = target && findObject(project, target)?.name;
  const refresh = () => qc.invalidateQueries({ queryKey: ['comments', projectId] });
  const add = useMutation({
    mutationFn: (b: { body: string }) =>
      api(`/projects/${projectId}/comments`, { method: 'POST', json: { ...b, targetId: target ?? null, targetName: targetName ?? null } }),
    onSuccess: () => {
      setText('');
      void refresh();
    },
    onError: e => toast.error(e.message),
  });
  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: CommentStatus }) => api(`/projects/${projectId}/comments/${v.id}`, { method: 'PATCH', json: { status: v.status } }),
    onSuccess: refresh,
  });
  const roots = data.filter(c => !c.parent_id);
  const open = roots.filter(c => c.status !== 'resolved');
  const done = roots.filter(c => c.status === 'resolved');
  const thread = (c: CommentRow) => (
    <CommentThread key={c.id} comment={c} replies={data.filter(r => r.parent_id === c.id)} onStatus={status => setStatus.mutate({ id: c.id, status })} />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {roots.length === 0 ? (
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessageSquareIcon />
              </EmptyMedia>
              <EmptyTitle>{m.panels_no_comments()}</EmptyTitle>
              <EmptyDescription>{m.panels_no_comments_hint()}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="space-y-2">
            {open.map(thread)}
            {done.length > 0 && <p className="pt-2 text-xs text-muted-foreground">{m.panels_resolved_count({ count: done.length })}</p>}
            {done.map(thread)}
          </div>
        )}
      </div>
      {can(role, 'commenter') && (
        <form
          className="space-y-2 border-t p-3"
          onSubmit={e => {
            e.preventDefault();
            if (text.trim()) add.mutate({ body: text.trim() });
          }}
        >
          <p className="text-xs text-muted-foreground">{targetName ? m.panels_comment_on({ name: targetName }) : m.panels_comment_on_project()}</p>
          <Textarea value={text} onChange={e => setText(e.target.value)} rows={2} placeholder={m.panels_comment_placeholder()} />
          <Button size="sm" type="submit" disabled={!text.trim() || add.isPending}>
            {m.panels_comment_submit()}
          </Button>
        </form>
      )}
    </div>
  );
}

function CommentThread({ comment: c, replies, onStatus }: { comment: CommentRow; replies: CommentRow[]; onStatus: (s: CommentStatus) => void }) {
  const role = useEditor(s => s.role);
  const focus = useEditor(s => s.focus);
  const askAgent = useEditor(s => s.askAgent);
  return (
    <Card size="sm" className="gap-1 px-3 text-sm">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {c.author ?? m.panels_someone()} · {fmtTime(c.created_at)}
        </span>
        <Badge variant={c.status === 'pending-confirm' ? 'default' : 'secondary'}>{STATUS[c.status]()}</Badge>
      </div>
      {c.target_name && (
        <Button variant="link" size="xs" className="h-auto justify-start p-0 text-foreground" onClick={() => c.target_id && focus([c.target_id])}>
          @{c.target_name}
        </Button>
      )}
      <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
      {replies.map(r => (
        <div key={r.id} className="mt-2 border-l-2 pl-2 text-sm">
          <p className="text-xs text-muted-foreground">
            {r.author ?? m.panels_someone()} · {fmtTime(r.created_at)}
          </p>
          <p className="whitespace-pre-wrap">{r.body}</p>
        </div>
      ))}
      {can(role, 'commenter') && (
        <div className="mt-2 flex flex-wrap gap-1">
          {c.status !== 'resolved' && (
            <Button size="xs" variant="ghost" onClick={() => onStatus('resolved')}>
              <CheckIcon /> {m.panels_resolve()}
            </Button>
          )}
          {c.status === 'resolved' && (
            <Button size="xs" variant="ghost" onClick={() => onStatus('open')}>
              {m.panels_reopen()}
            </Button>
          )}
          {can(role, 'editor') && c.status !== 'resolved' && (
            <Button
              size="xs"
              variant="ghost"
              onClick={() =>
                askAgent(m.panels_ask_agent_prompt({ about: c.target_name ? m.panels_ask_agent_about({ name: c.target_name }) : '', body: c.body, id: c.id }))
              }
            >
              {m.panels_ask_agent()}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
