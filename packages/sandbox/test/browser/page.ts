/** The test page: scenarios against the browser host, run by host.test.ts */
import { createBrowserSandbox } from '../../src/browser.js';
import { SandboxError } from '../../src/types.js';

const kind = (e: unknown) => (e instanceof SandboxError ? e.kind : String(e));
const frames = () => document.querySelectorAll('iframe').length;

(window as unknown as { scenarios: unknown }).scenarios = {
  async basic(workerUrl: string) {
    const box = createBrowserSandbox({ worker: { url: workerUrl }, wasmUrl: '/quickjs.wasm' });
    const s = await box.realm('lib').script('count', 'function count(k) { return data.walls.filter(w => w.kind === k).length }');
    await s.setData('data', { walls: [{ kind: 'bearing' }, { kind: 'bearing' }, { kind: 'partition' }] });
    const out = await s.call('count', ['bearing']);
    const spin = await box.realm('lib').script('spin', 'function spin() { for (;;) {} }');
    const timeout = await spin.call('spin', []).then(() => 'none', kind);
    const after = await s.call('count', ['partition']);
    box.dispose();
    return { out, timeout, after };
  },
  async probe(workerUrl: string, url: string) {
    const box = createBrowserSandbox({ worker: { url: workerUrl }, wasmUrl: '/quickjs.wasm' });
    const out = await box.request('probe', { url });
    const frame = document.querySelector('iframe');
    const result = {
      ...(out as object),
      sandbox: frame?.getAttribute('sandbox'),
      pageCanReadFrame: (() => {
        try {
          return !!frame?.contentDocument;
        } catch {
          return false;
        }
      })(),
    };
    box.dispose();
    return result;
  },
  async watchdog(workerUrl: string) {
    const box = createBrowserSandbox({ worker: { url: workerUrl }, wasmUrl: '/quickjs.wasm', watchdogMs: 1500 });
    const s = await box.realm('lib').script('get', 'function get() { return data.n }');
    await s.setData('data', { n: 7 });
    const before = frames();
    const crash = await box.request('hang').then(() => 'none', kind);
    const during = frames();
    // The next call starts a new worker, remakes the script and sends its data again
    const after = await s.call('get', []);
    const end = frames();
    box.dispose();
    return { before, crash, during, after, end, gone: frames() };
  },
};
