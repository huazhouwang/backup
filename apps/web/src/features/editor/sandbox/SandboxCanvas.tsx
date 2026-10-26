/**
 * The sample room (issue 171): the plan drawn by a canvas page that runs in a sandbox, built from the wheels (src/wheels) like any
 * page an agent may write. The page is an opaque-origin iframe (sandbox="allow-scripts", no allow-same-origin) with a content
 * security policy that allows no network at all; the wheels are inlined into it as the module `plinth`. It sees the design
 * only through the bridge (wheels/protocol.ts): the design and its changes, the level and the selection come in; capability
 * calls and selections go out, and every call is made here, as the person looking, through the same registry as the editor.
 */
import { findObject, mutates } from '@plinth/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import wheels from 'virtual:canvas-wheels';
import css from '@/canvas/canvas.css?inline';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getLocale, m } from '@/lib/i18n';
import { cn } from 'cn';
import { registry } from '../agent/registry';
import { useEditor, useEditorStore } from '../store';
import { setCanvasPage } from './host';
import { diffProject, isEmptyDiff, type CallReply, type HostMessage, type PageMessage } from '@/wheels/protocol';

/** UTF-8 text as base64, for a data: URL */
function base64(text: string) {
  const bytes = new TextEncoder().encode(text);
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

/** No network for the page: everything it runs is inlined, and fonts fall back to the system's */
const CSP = "default-src 'none'; script-src 'unsafe-inline' data:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:";

/** The page: the canvas stylesheet (light theme, without its web fonts), the wheels as `plinth`, and the default page */
function pageHtml() {
  const style = css.replace(/@font-face\s*\{[^}]*\}/g, '');
  const imports = { imports: { plinth: `data:text/javascript;base64,${base64(wheels)}` } };
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}">
<style>${style}</style><script type="importmap">${JSON.stringify(imports)}</script></head><body>
<script type="module">globalThis.plinthBytes=${wheels.length};import('plinth').then(p=>p.start()).catch(e=>parent.postMessage({type:'error',source:'start',message:String(e&&e.stack||e)},'*'))</script>
</body></html>`;
}

/** Capabilities a page may not call: those that reach outside the design, and the editor's own view controls */
const refused = (name: string, canEdit: boolean): string | null => {
  const c = registry.get(name);
  if (!c) return `unknown capability ${name}`;
  if (c.permission === 'external' || c.runtime === 'browser') return `${name} is not available to a canvas page`;
  if (mutates(c) && !canEdit) return `you may not change this design`;
  return null;
};

export function SandboxCanvas({ className }: { className?: string }) {
  const store = useEditorStore();
  const project = useEditor(s => s.project);
  const level = useEditor(s => s.view.level);
  const selection = useEditor(s => s.view.selection);
  const canEdit = useEditor(s => s.canEdit());
  const select = useEditor(s => s.select);
  const ref = useRef<HTMLIFrameElement>(null);
  const srcDoc = useMemo(() => pageHtml(), []);
  // What the page was last told, so only changes are sent; and whether it has started
  const told = useRef({ started: false, project, level, selection, canEdit });
  const [errors, setErrors] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  const post = (msg: HostMessage) => ref.current?.contentWindow?.postMessage(msg, '*');
  // Trying modules before they are saved: the page answers each request
  const tries = useRef(new Map<number, (r: { ok: true } | { ok: false; error: string }) => void>());
  useEffect(() => {
    if (!ready) return;
    let n = 0;
    setCanvasPage(
      (id, source) =>
        new Promise(resolve => {
          const reqId = ++n;
          tries.current.set(reqId, resolve);
          post({ type: 'try', reqId, id, source });
          setTimeout(() => tries.current.has(reqId) && (tries.current.delete(reqId), resolve({ ok: false, error: 'the canvas page did not answer' })), 5000);
        }),
    );
    return () => void setCanvasPage(null);
  }, [ready]);

  const init = () => {
    const s = store.getState();
    told.current = { started: true, project: s.project, level: s.view.level, selection: s.view.selection, canEdit: s.canEdit() };
    post({
      type: 'init',
      project: s.project,
      level: s.view.level,
      selection: s.view.selection,
      locale: getLocale() === 'en' ? 'en' : 'zh',
      canEdit: s.canEdit(),
    });
  };

  useEffect(() => {
    const onMessage = async (e: MessageEvent<PageMessage>) => {
      if (!ref.current || e.source !== ref.current.contentWindow) return;
      const msg = e.data;
      switch (msg.type) {
        case 'tried':
          tries.current.get(msg.reqId)?.(msg.ok ? { ok: true } : { ok: false, error: msg.error ?? 'failed' });
          tries.current.delete(msg.reqId);
          return;
        case 'ready':
          setReady(true);
          (globalThis as { plinthSandboxPerf?: unknown }).plinthSandboxPerf = { ...msg.perf };
          return;
        case 'select': {
          const p = store.getState().project;
          const ids = msg.ids.filter(id => findObject(p, id));
          told.current.selection = ids;
          select(ids);
          return;
        }
        case 'call': {
          const why = refused(msg.name, store.getState().canEdit());
          let reply: CallReply;
          if (why) reply = { ok: false, error: { code: 'forbidden', message: why } };
          else {
            const r = await store.getState().call(msg.name, msg.input);
            reply = {
              ok: r.ok,
              ...(r.ok
                ? { result: JSON.parse(JSON.stringify(r.result ?? null)) }
                : { error: { code: r.error?.code ?? 'error', message: r.error?.message ?? '' } }),
            };
          }
          post({ type: 'reply', id: msg.id, reply });
          return;
        }
        case 'error':
          setErrors(list => [...list.slice(-4), `${msg.source}: ${msg.message}`]);
          console.warn(`[canvas page] ${msg.source}: ${msg.message}`);
          return;
        case 'perf': {
          const perf = ((globalThis as { plinthSandboxPerf?: Record<string, number> }).plinthSandboxPerf ??= {});
          perf[msg.name] = msg.ms;
          return;
        }
        case 'key': {
          // As the editor's own canvas does: its shortcuts work with the focus in the page
          const { type: _t, ...init } = msg;
          dispatchEvent(new KeyboardEvent('keydown', { ...init, cancelable: true }));
          return;
        }
      }
    };
    addEventListener('message', onMessage);
    return () => removeEventListener('message', onMessage);
  }, [store, select]);

  // Changes go to the page as they happen: the design as a diff, the level, the selection, whether one may edit
  useEffect(() => {
    const t = told.current;
    if (!t.started || t.project === project) return;
    const diff = diffProject(t.project, project);
    t.project = project;
    if (!isEmptyDiff(diff)) post({ type: 'project', diff, sentAt: Date.now() });
  }, [project]);
  useEffect(() => {
    const t = told.current;
    if (!t.started || t.level === level) return;
    t.level = level;
    post({ type: 'level', level });
  }, [level]);
  useEffect(() => {
    const t = told.current;
    if (!t.started || t.selection.join('\n') === selection.join('\n')) return;
    t.selection = selection;
    post({ type: 'selection', ids: selection });
  }, [selection]);
  useEffect(() => {
    const t = told.current;
    if (!t.started || t.canEdit === canEdit) return;
    t.canEdit = canEdit;
    post({ type: 'canEdit', canEdit });
  }, [canEdit]);

  return (
    <div className={cn('relative', className)}>
      <iframe
        ref={ref}
        title={m.editor_sandbox_canvas()}
        sandbox="allow-scripts"
        srcDoc={srcDoc}
        onLoad={init}
        data-sandbox-canvas=""
        data-ready={ready ? '' : undefined}
        className="size-full border-0"
      />
      {errors.length > 0 && (
        <Alert variant="destructive" className="absolute right-2 bottom-2 left-2 w-auto">
          <AlertDescription>{m.editor_sandbox_error({ message: errors[errors.length - 1] })}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
