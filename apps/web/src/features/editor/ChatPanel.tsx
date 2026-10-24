/**
 * Chat with the agent. Every capability in the list is a browser-side tool: agent calls run here (same transaction and undo);
 * actions needing confirmation show a confirmation card. Chats are saved per user and per plan.
 */
import { findObject, type Project } from '@plinth/core';
import type { ToolApprovalInterrupt } from '@tanstack/ai-client';
import { Link } from '@tanstack/react-router';
import { ArrowUpIcon, CircleStopIcon, ImagePlusIcon, ShieldQuestionIcon, SparklesIcon, SettingsIcon, XIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from '@/components/ai-elements/conversation';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@/components/ui/input-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { registry } from '@/features/editor/agent/registry';
import { m } from '@/lib/i18n';
import { AUTONOMIES, autonomyHint, autonomyLabel, getAutonomy, getChatModel, setAutonomy, setChatModel } from '@/lib/prefs';
import type { Autonomy } from '@/features/editor/agent/policy';
import { can } from '@/shared/roles';
import { ChangeCard } from './chat/ChangeCard';
import { LookCard } from './chat/LookCard';
import { titleOf, type ToolResultPart } from './chat/common';
import { MessageView } from './chat/MessageView';
import { useAgentChat } from './chat/useAgentChat';
import { projectModel, useEditor } from './store';

const SUGGESTIONS = [m.chat_suggestion_size, m.chat_suggestion_enlarge, m.chat_suggestion_window, m.chat_suggestion_check];
const SUGGESTIONS_BLANK = [m.chat_suggestion_blank_family, m.chat_suggestion_blank_yard];

/** Describe a capability call in one sentence (for the confirmation card) */
function describeCall(name: string, args: unknown, project: Project) {
  const c = registry.get(name);
  if (c?.mode === 'edit') {
    try {
      return c.label(c.input.parse(args), project);
    } catch {}
  }
  return m.chat_call_fallback({ title: titleOf(name), args: JSON.stringify(args) });
}

/** A photo or sketch scaled down to at most 1024 px, as a JPEG data URL, so threads stay small */
function downscale(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1024 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export function ChatPanel() {
  const role = useEditor(s => s.role);
  const projectId = useEditor(s => s.projectId);
  const models = useEditor(s => s.models);
  const fallback = useEditor(s => projectModel(s));
  const project = useEditor(s => s.project);
  const view = useEditor(s => s.view);
  const readOnly = useEditor(s => s.readOnlyVersion != null);
  const [autonomy, setAuto] = useState<Autonomy>('balanced');
  const [input, setInput] = useState('');
  // Photos and sketches to send with the next message (downscaled JPEG data URLs)
  const [images, setImages] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const editable = can(role, 'editor') && !readOnly;
  // The model picked in this chat; falls back to the project's model when unset or no longer available
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => setAuto(getAutonomy()), []);
  useEffect(() => setPicked(getChatModel(projectId)), [projectId]);
  const model = models.find(x => x.id === picked) ?? fallback;
  const pickModel = (id: string) => {
    const next = id === fallback?.id ? null : id;
    setPicked(next);
    setChatModel(projectId, next);
  };

  const { messages, send: sendText, isLoading, stop, error, interrupts, shots } = useAgentChat({ autonomy, editable, modelId: model?.id });
  const send = (text: string) => {
    if ((!text.trim() && !images.length) || isLoading) return;
    setInput('');
    setImages([]);
    sendText(text, images);
  };
  const attach = async (files: FileList | null) => {
    const picked = await Promise.all(
      [...(files ?? [])]
        .filter(f => f.type.startsWith('image/'))
        .slice(0, 4)
        .map(downscale),
    );
    setImages(s => [...s, ...picked].slice(0, 4));
    if (fileRef.current) fileRef.current.value = '';
  };

  const selection = view.selection.map(id => findObject(project, id)?.name).filter(Boolean);
  const results = new Map<string, ToolResultPart>();
  for (const msg of messages) for (const p of msg.parts) if (p.type === 'tool-result') results.set(p.toolCallId, p);
  const blank = project.walls.length === 0;
  // needsApproval is decided per autonomy at runtime, so the tool types can't tell which calls may ask for approval
  const approvals = (interrupts as ReadonlyArray<{ kind: string }>).filter((it): it is ToolApprovalInterrupt => it.kind === 'tool-approval');

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0 text-xs text-muted-foreground">
          {editable && model ? (
            <Select value={model.id} onValueChange={v => pickModel(v as string)}>
              <SelectTrigger size="sm" className="h-7 max-w-full gap-1 text-xs" aria-label={m.chat_model_aria()}>
                <SelectValue>{m.chat_model({ label: model.label })}</SelectValue>
              </SelectTrigger>
              <SelectContent align="start" className="w-auto max-w-80">
                {models.map(x => (
                  <SelectItem key={x.id} value={x.id}>
                    <span>{x.label}</span>
                    {x.id === fallback?.id && <span className="text-xs text-muted-foreground">{m.chat_model_project_default()}</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : model ? (
            <span className="truncate">{m.chat_model({ label: model.label })}</span>
          ) : (
            <span>{m.chat_no_model()}</span>
          )}
        </div>
        <Select
          value={autonomy}
          onValueChange={v => {
            setAuto(v as Autonomy);
            setAutonomy(v as Autonomy);
          }}
        >
          <SelectTrigger size="sm" className="h-7 w-auto gap-1 text-xs" aria-label={m.chat_autonomy_aria()}>
            <SelectValue>{autonomyLabel(autonomy)}</SelectValue>
          </SelectTrigger>
          <SelectContent align="end">
            {AUTONOMIES.map(k => (
              <SelectItem key={k} value={k}>
                <div className="flex flex-col">
                  <span>{autonomyLabel(k)}</span>
                  <span className="text-xs text-muted-foreground">{autonomyHint(k)}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!model && editable && (
        <Alert className="m-3 w-auto">
          <SettingsIcon />
          <AlertTitle>{m.chat_setup_model_title()}</AlertTitle>
          <AlertDescription>
            {role === 'owner' ? (
              <span>
                {m.chat_setup_model_owner_before()}
                <Button variant="link" className="h-auto p-0" nativeButton={false} render={<Link to="/settings" />}>
                  {m.chat_setup_model_owner_link()}
                </Button>
                {m.chat_setup_model_owner_after()}
              </span>
            ) : (
              <span>{m.chat_setup_model_member()}</span>
            )}
          </AlertDescription>
        </Alert>
      )}

      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="gap-4 px-3">
          {messages.length === 0 ? (
            <ConversationEmptyState
              icon={<SparklesIcon className="size-6" />}
              title={blank ? m.chat_empty_title_blank() : m.chat_empty_title()}
              description={blank ? m.chat_empty_description_blank() : m.chat_empty_description()}
            >
              <div className="mt-3 flex flex-col gap-2">
                {(blank ? SUGGESTIONS_BLANK : SUGGESTIONS)
                  .map(suggestion => suggestion())
                  .map(s => (
                    <Button
                      key={s}
                      variant="outline"
                      size="sm"
                      className="h-auto justify-start whitespace-normal py-1.5 text-left"
                      disabled={!editable || !model}
                      onClick={() => send(s)}
                    >
                      {s}
                    </Button>
                  ))}
              </div>
            </ConversationEmptyState>
          ) : (
            messages.map(msg => <MessageView key={msg.id} msg={msg} results={results} streaming={isLoading} />)
          )}
          {shots.map((s, i) => (
            <img key={i} src={s} alt={m.chat_screenshot_alt()} className="rounded-md border" />
          ))}
          {isLoading && <Shimmer className="text-sm">{m.chat_thinking()}</Shimmer>}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {approvals.map(it => (
        <Alert key={it.id} className="mx-3 mb-2 w-auto">
          <ShieldQuestionIcon />
          <AlertTitle>{m.chat_approval_title({ title: titleOf(it.toolName) })}</AlertTitle>
          <AlertDescription>
            <p>{describeCall(it.toolName, it.originalArgs, project)}</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => it.resolveInterrupt(true)}>
                {m.chat_approve()}
              </Button>
              <Button size="sm" variant="outline" onClick={() => it.resolveInterrupt(false)}>
                {m.chat_deny()}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ))}

      <LookCard />
      <ChangeCard />

      <form
        className="border-t p-3"
        onSubmit={e => {
          e.preventDefault();
          send(input);
        }}
      >
        {selection.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {selection.slice(0, 4).map(n => (
              <Badge key={n} variant="secondary">
                {m.chat_selected({ name: n ?? '' })}
              </Badge>
            ))}
          </div>
        )}
        {images.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {images.map((src, i) => (
              <div key={i} className="relative">
                <img src={src} alt={m.chat_attachment_alt()} className="size-16 rounded-md border object-cover" />
                <Button
                  type="button"
                  size="icon-xs"
                  variant="secondary"
                  className="absolute -top-2 -right-2 rounded-full"
                  onClick={() => setImages(s => s.filter((_, k) => k !== i))}
                  aria-label={m.chat_attachment_remove()}
                >
                  <XIcon />
                </Button>
              </div>
            ))}
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => void attach(e.target.files)} />
        <InputGroup>
          <InputGroupTextarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder={
              !editable
                ? readOnly
                  ? m.chat_placeholder_history()
                  : m.chat_placeholder_viewer()
                : !model
                  ? m.chat_placeholder_no_model()
                  : m.chat_placeholder()
            }
            disabled={!editable || !model}
            rows={2}
            className="max-h-40"
          />
          <InputGroupAddon align="block-end" className="justify-between">
            <InputGroupButton
              size="icon-sm"
              variant="ghost"
              disabled={!editable || !model}
              onClick={() => fileRef.current?.click()}
              aria-label={m.chat_attach()}
            >
              <ImagePlusIcon />
            </InputGroupButton>
            {isLoading ? (
              <InputGroupButton size="icon-sm" variant="secondary" onClick={() => stop()} aria-label={m.chat_stop()}>
                <CircleStopIcon />
              </InputGroupButton>
            ) : (
              <InputGroupButton
                type="submit"
                size="icon-sm"
                variant="default"
                disabled={(!input.trim() && !images.length) || !editable || !model}
                aria-label={m.chat_send()}
              >
                <ArrowUpIcon />
              </InputGroupButton>
            )}
          </InputGroupAddon>
        </InputGroup>
      </form>
    </div>
  );
}
