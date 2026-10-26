/**
 * The engine's side of the browser host, run in the dedicated worker (see browser.ts). It gets the wasm bytes and a port in an
 * init message, then answers requests on the port. Every request carries its script's source, so a script is (re)made on first
 * use, also after the worker was replaced.
 */
import { createEngine } from './engine.js';
import { SandboxError, type Sandbox, type SandboxOptions } from './types.js';

export type Request = { id: number } & (
  | { op: 'script'; realm: string; key: string; source: string }
  | { op: 'setData'; realm: string; key: string; source: string; name: string; value: unknown }
  | { op: 'call'; realm: string; key: string; source: string; fn: string; args: unknown[] }
  | { op: 'dispose'; realm: string }
);
export type Response = { id: number } & ({ ok: true; value?: unknown } | { ok: false; kind: SandboxError['kind']; message: string });
export type Init = { type: 'init'; wasm: ArrayBuffer; options: SandboxOptions; port: MessagePort };

/** Extra operations for tests (probing the worker's environment); production passes none */
export type Extra = (req: { op: string; [k: string]: unknown }) => Promise<unknown> | undefined;

export function serve(scope: { onmessage: ((e: MessageEvent) => void) | null }, extra?: Extra) {
  scope.onmessage = async (e: MessageEvent<Init>) => {
    if (e.data?.type !== 'init') return;
    scope.onmessage = null;
    const { wasm, options, port } = e.data;
    const box: Sandbox = createEngine(await WebAssembly.compile(wasm), options);
    port.onmessage = async (m: MessageEvent<Request>) => {
      const req = m.data;
      let res: Response;
      try {
        res = { id: req.id, ok: true, value: await handle(box, req, extra) };
      } catch (err) {
        res =
          err instanceof SandboxError
            ? { id: req.id, ok: false, kind: err.kind, message: err.message }
            : { id: req.id, ok: false, kind: 'crash', message: String(err) };
      }
      port.postMessage(res);
    };
    port.postMessage({ id: 0, ok: true });
  };
}

async function handle(box: Sandbox, req: Request, extra?: Extra) {
  switch (req.op) {
    case 'script':
      await box.realm(req.realm).script(req.key, req.source);
      return;
    case 'setData':
      return (await box.realm(req.realm).script(req.key, req.source)).setData(req.name, req.value);
    case 'call':
      return (await box.realm(req.realm).script(req.key, req.source)).call(req.fn, req.args);
    case 'dispose':
      box.realm(req.realm).dispose();
      return;
    default: {
      const out = extra?.(req as { op: string });
      if (out) return out;
      throw new SandboxError('script', `unknown operation ${(req as { op: string }).op}`);
    }
  }
}
