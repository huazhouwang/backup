/**
 * The browser host. The engine runs in a dedicated worker started from a hidden iframe with an opaque origin (sandbox without
 * allow-same-origin) and a Content Security Policy that allows no network: even code that escaped QuickJS would land in a thread
 * with no session, no page and no network. The page talks to the worker over a MessagePort.
 *
 * A watchdog bounds every request: if the worker doesn't answer in time (a hang the engine's deadline couldn't interrupt), the
 * iframe and its worker are removed and every pending request fails with 'crash'. The next request starts a new worker, remaking
 * its script from source and sending its data again.
 */
import type { Request, Response } from './serve.js';
import { DEFAULTS, SandboxError, type Realm, type Sandbox, type SandboxOptions, type Script } from './types.js';

export interface BrowserSandboxOptions extends SandboxOptions {
  /**
   * The worker script (src/worker.ts) bundled as a classic script (IIFE; a module worker can't start from an opaque origin): its
   * source, or a same-origin URL to fetch it from
   */
  worker: { source: string } | { url: string | URL };
  /** The QuickJS wasm file, same origin */
  wasmUrl: string | URL;
  /** How long a request may go unanswered before the worker is replaced; default 5 deadlines plus 2 s */
  watchdogMs?: number;
}

const CSP = "default-src 'none'; script-src 'unsafe-inline' blob: 'wasm-unsafe-eval'; worker-src blob:";

/** The iframe's only script: on the page's first message, start the worker from the given source and hand it the port and the wasm */
const BOOT = `<!doctype html><meta http-equiv="Content-Security-Policy" content="${CSP}"><script>
onmessage = e => {
  if (e.source !== parent) return;
  onmessage = null;
  const { source, wasm, options } = e.data;
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  const worker = new Worker(url);
  worker.postMessage({ type: 'init', wasm, options, port: e.ports[0] }, [e.ports[0], wasm]);
};
</script>`;

type Pending = { resolve: (v: unknown) => void; reject: (e: unknown) => void; timer: ReturnType<typeof setTimeout> };
type Host = { generation: number; port: MessagePort; frame: HTMLIFrameElement; ready: Promise<void> };

export interface BrowserSandbox extends Sandbox {
  /** Sends an operation the worker defines beyond the API, for tests probing the worker (the production worker defines none) */
  request(op: string, fields?: Record<string, unknown>): Promise<unknown>;
}

export function createBrowserSandbox(options: BrowserSandboxOptions): BrowserSandbox {
  const opts = { ...DEFAULTS, ...options };
  const watchdogMs = options.watchdogMs ?? opts.deadlineMs * 5 + 2000;
  const engineOptions: SandboxOptions = { memoryMB: opts.memoryMB, stackKB: opts.stackKB, deadlineMs: opts.deadlineMs, maxOutputKB: opts.maxOutputKB };
  let assets: Promise<[string, ArrayBuffer]> | undefined;
  let worker: Host | undefined;
  let generation = 0;
  let nextId = 1;
  const pending = new Map<number, Pending>();

  const load = () =>
    (assets ??= Promise.all([
      'source' in options.worker ? options.worker.source : fetch(options.worker.url).then(r => r.text()),
      fetch(options.wasmUrl).then(r => r.arrayBuffer()),
    ]));

  function replace(reason: string) {
    if (!worker) return;
    worker.port.close();
    worker.frame.remove();
    worker = undefined;
    for (const [id, p] of pending) {
      clearTimeout(p.timer);
      p.reject(new SandboxError('crash', reason));
      pending.delete(id);
    }
  }

  function start(): Host {
    if (worker) return worker;
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.display = 'none';
    frame.srcdoc = BOOT;
    const channel = new MessageChannel();
    const w: Host = { generation: ++generation, port: channel.port1, frame, ready: Promise.resolve() };
    w.ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new SandboxError('crash', 'sandbox worker did not start')), watchdogMs);
      channel.port1.onmessage = (e: MessageEvent<Response>) => {
        if (e.data.id === 0) {
          clearTimeout(timer);
          channel.port1.onmessage = (m: MessageEvent<Response>) => settle(m.data);
          resolve();
        }
      };
      frame.addEventListener('load', async () => {
        try {
          const [source, wasm] = await load();
          const copy = wasm.slice(0);
          frame.contentWindow!.postMessage({ source, wasm: copy, options: engineOptions }, '*', [channel.port2, copy]);
        } catch (err) {
          clearTimeout(timer);
          reject(new SandboxError('crash', `sandbox assets failed to load: ${err}`));
        }
      });
    });
    w.ready.catch(() => worker === w && replace('sandbox worker did not start'));
    document.body.appendChild(frame);
    worker = w;
    return w;
  }

  function settle(res: Response) {
    const p = pending.get(res.id);
    if (!p) return;
    pending.delete(res.id);
    clearTimeout(p.timer);
    if (res.ok) p.resolve(res.value);
    else p.reject(new SandboxError(res.kind, res.message));
  }

  type Outgoing = Request extends infer R ? (R extends { id: number } ? Omit<R, 'id'> : never) : never;

  async function send(req: Outgoing): Promise<{ value: unknown; generation: number }> {
    const w = start();
    await w.ready;
    const id = nextId++;
    const value = await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => worker === w && replace('sandbox worker stopped answering'), watchdogMs);
      pending.set(id, { resolve, reject, timer });
      // A MessagePort, not a window: there is no target origin
      // oxlint-disable-next-line unicorn/require-post-message-target-origin
      w.port.postMessage({ ...req, id });
    });
    return { value, generation: w.generation };
  }

  class BrowserScript implements Script {
    private data = new Map<string, unknown>();
    /** The worker generation that holds this script's data */
    private sent = 0;

    constructor(
      private realm: string,
      private key: string,
      private source: string,
    ) {}

    /** After a worker replacement, the script's data is sent again before anything else */
    private async resend() {
      if (this.sent === generation && worker) return;
      for (const [name, value] of this.data) await send({ op: 'setData', realm: this.realm, key: this.key, source: this.source, name, value });
      this.sent = generation;
    }

    async setData(name: string, value: unknown) {
      this.data.set(name, value);
      await this.resend();
      const { generation: g } = await send({ op: 'setData', realm: this.realm, key: this.key, source: this.source, name, value });
      this.sent = g;
    }

    async call(fn: string, args: unknown[]) {
      await this.resend();
      return (await send({ op: 'call', realm: this.realm, key: this.key, source: this.source, fn, args })).value;
    }
  }

  const realms = new Map<string, Realm>();
  return {
    realm(realmKey): Realm {
      const known = realms.get(realmKey);
      if (known) return known;
      const scripts = new Map<string, BrowserScript>();
      const realm: Realm = {
        async script(key, source) {
          const known = scripts.get(key);
          if (known) return known;
          await send({ op: 'script', realm: realmKey, key, source });
          const s = new BrowserScript(realmKey, key, source);
          scripts.set(key, s);
          return s;
        },
        dispose() {
          scripts.clear();
          realms.delete(realmKey);
          if (worker) void send({ op: 'dispose', realm: realmKey }).catch(() => {});
        },
      };
      realms.set(realmKey, realm);
      return realm;
    },
    async request(op, fields = {}) {
      return (await send({ ...fields, op } as unknown as Outgoing)).value;
    },
    dispose() {
      realms.clear();
      replace('sandbox disposed');
    },
  };
}
