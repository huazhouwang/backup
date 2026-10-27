/**
 * The browser host in Chromium: the worker in an opaque-origin iframe with no network, the deadline, and the watchdog replacing
 * a hung worker. Needs Playwright's Chromium (`npm run test:browser -w @opensu/sandbox`).
 */
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { build } from 'esbuild';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { wasmPath } from '../support.js';

const bundle = async (entry: string, format: 'esm' | 'iife' = 'esm') =>
  (await build({ entryPoints: [join(import.meta.dirname, entry)], bundle: true, write: false, format, platform: 'browser' })).outputFiles[0].text;

let server: Server, browser: Browser, page: Page, base: string;

beforeAll(async () => {
  const files: Record<string, [string, string | Buffer]> = {
    '/': ['text/html', '<!doctype html><body><script type="module" src="/page.js"></script>'],
    '/page.js': ['text/javascript', await bundle('page.ts')],
    '/worker.js': ['text/javascript', await bundle('../../src/worker.ts', 'iife')],
    '/probe-worker.js': ['text/javascript', await bundle('probe-worker.ts', 'iife')],
    '/quickjs.wasm': ['application/wasm', readFileSync(wasmPath)],
  };
  server = createServer((req, res) => {
    const f = files[req.url ?? ''];
    res.writeHead(f ? 200 : 404, { 'content-type': f?.[0] ?? 'text/plain', 'access-control-allow-origin': '*' });
    res.end(f?.[1] ?? 'not found');
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  browser = await chromium.launch();
  page = await browser.newPage();
  page.on('pageerror', e => process.stderr.write('[pageerror] ' + e.message + '\n'));
  await page.goto(base);
  await page.waitForFunction(() => 'scenarios' in window);
}, 60_000);

afterAll(async () => {
  await browser?.close();
  server?.close();
});

const run = (name: string, ...args: unknown[]) =>
  page.evaluate(([name, args]) => (window as any).scenarios[name as string](...(args as unknown[])), [name, args] as const);

it('runs scripts in the worker, with the deadline', async () => {
  expect(await run('basic', '/worker.js')).toEqual({ out: 2, timeout: 'timeout', after: 1 });
}, 30_000);

it('runs the worker with an opaque origin, no network and no storage', async () => {
  // The URL allows any origin (CORS), so only the sandbox's policy can block it
  expect(await run('probe', '/probe-worker.js', `${base}/worker.js`)).toEqual({
    origin: 'null',
    network: 'blocked',
    storage: 'blocked',
    sandbox: 'allow-scripts',
    pageCanReadFrame: false,
  });
}, 30_000);

it('replaces a hung worker and remakes its scripts and data on next use', async () => {
  expect(await run('watchdog', '/probe-worker.js')).toEqual({ before: 1, crash: 'crash', during: 0, after: 7, end: 1, gone: 0 });
}, 30_000);
