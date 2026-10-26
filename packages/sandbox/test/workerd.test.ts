/** The in-place host in workerd (the Cloudflare Workers runtime), which forbids compiling code from strings and wasm from bytes */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { expect, it } from 'vitest';
import { wasmPath } from './support.js';

const entry = `
import { createSandbox } from ${JSON.stringify(join(import.meta.dirname, '../src/workerd.ts'))};
export default {
  async fetch() {
    let hostEval;
    try { new Function('return 1')(); hostEval = 'allowed'; } catch { hostEval = 'blocked'; }
    const box = createSandbox();
    const s = await box.realm('lib').script('widget', 'function widget(k) { return [1, 2, 3].map(x => x * k) }');
    const out = await s.call('widget', [2]);
    box.dispose();
    return Response.json({ hostEval, out });
  },
};`;

it('runs scripts in workerd', async () => {
  const bundle = await build({
    stdin: { contents: entry, resolveDir: import.meta.dirname, loader: 'ts' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    conditions: ['workerd', 'worker', 'browser'],
    plugins: [
      {
        name: 'wasm',
        setup(b) {
          b.onResolve({ filter: /quickjs-wasmfile-release-sync\/wasm$/ }, () => ({ path: './quickjs.wasm', external: true }));
        },
      },
    ],
  });
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      compatibilityDate: '2026-10-01',
      modules: [
        { type: 'ESModule', path: 'worker.mjs', contents: bundle.outputFiles[0].text },
        { type: 'CompiledWasm', path: 'quickjs.wasm', contents: readFileSync(wasmPath) },
      ],
    }),
  );
  try {
    const res = await mf.dispatchFetch('http://localhost/');
    expect(await res.json()).toEqual({ hostEval: 'blocked', out: [2, 4, 6] });
  } finally {
    await mf.dispose();
  }
}, 60_000);
