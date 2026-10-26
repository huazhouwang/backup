import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEngine, SandboxError } from '../src/index.js';
import type { EngineRealm } from '../src/engine.js';
import { sampleProject, wasmModule } from './support.js';

const kind = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof SandboxError ? e.kind : `not a SandboxError: ${e}`;
  }
};

describe('running scripts', () => {
  it('calls a script with data kept inside and params per call', async () => {
    const box = createEngine(wasmModule);
    const s = await box.realm('lib').script('count', 'function count(kind) { return project.walls.filter(w => w.kind === kind).length }');
    await s.setData('project', sampleProject);
    const bearing = sampleProject.walls.filter((w: { kind: string }) => w.kind === 'bearing').length;
    expect(await s.call('count', ['bearing'])).toBe(bearing);
    expect(await s.call('count', ['nothing'])).toBe(0);
    box.dispose();
  });

  it('freezes the data it is given', async () => {
    const box = createEngine(wasmModule);
    const s = await box
      .realm('lib')
      .script('mutate', `'use strict'; function mutate() { try { data.a.b = 2; return 'changed' } catch (e) { return data.a.b } }`);
    await s.setData('data', { a: { b: 1 } });
    expect(await s.call('mutate', [])).toBe(1);
    box.dispose();
  });

  it('reports script errors, a missing function and syntax errors as script errors', async () => {
    const box = createEngine(wasmModule);
    const realm = box.realm('lib');
    const s = await realm.script('boom', 'function boom() { throw new RangeError("bad") }');
    await expect(s.call('boom', [])).rejects.toThrow(/RangeError: bad/);
    expect(await kind(s.call('boom', []))).toBe('script');
    expect(await kind(s.call('missing', []))).toBe('script');
    expect(await kind(realm.script('syntax', 'function ('))).toBe('script');
    box.dispose();
  });
});

describe('two rules', () => {
  it('gives the guest no host functions and no standard library', async () => {
    const box = createEngine(wasmModule);
    const names = [
      'fetch',
      'XMLHttpRequest',
      'WebSocket',
      'window',
      'document',
      'self',
      'process',
      'require',
      'module',
      'setTimeout',
      'setInterval',
      'queueMicrotask',
      'WebAssembly',
      'importScripts',
      'std',
      'os',
      'bjson',
      'print',
      'console',
      'scriptArgs',
    ];
    const s = await box.realm('lib').script('probe', 'function probe(names) { return names.filter(n => typeof globalThis[n] !== "undefined") }');
    expect(await s.call('probe', [names])).toEqual([]);
    box.dispose();
  });

  it('loads no modules: import() and import statements fail', async () => {
    const box = createEngine(wasmModule);
    const realm = box.realm('lib');
    const s = await realm.script(
      'dyn',
      `let r = 'pending'; try { import('qjs:std').then(() => r = 'loaded', () => r = 'failed') } catch (e) { r = 'threw' } function dyn() { return r }`,
    );
    // No module loader, and pending jobs never run: nothing is ever loaded
    expect(await s.call('dyn', [])).not.toBe('loaded');
    expect(await kind(realm.script('stat', 'import * as std from "qjs:std"'))).toBe('script');
    box.dispose();
  });

  it('never loads bytecode: the engine uses no bytecode API', () => {
    const src = join(import.meta.dirname, '../src');
    for (const f of readdirSync(src)) {
      const text = readFileSync(join(src, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      expect(text, f).not.toMatch(/decodeBinaryJSON|encodeBinaryJSON|compileOnly|evalBytecode|JS_ReadObject|wasmBinary/);
    }
  });
});

describe('limits', () => {
  it('interrupts an endless loop at the deadline', async () => {
    const box = createEngine(wasmModule, { deadlineMs: 100 });
    const s = await box.realm('lib').script('spin', 'function spin() { for (;;) {} } function ok() { return 1 }');
    const t = Date.now();
    expect(await kind(s.call('spin', []))).toBe('timeout');
    expect(Date.now() - t).toBeLessThan(1000);
    // The script still works afterwards
    expect(await s.call('ok', [])).toBe(1);
    box.dispose();
  });

  it('interrupts an endless loop while the script is first evaluated', async () => {
    const box = createEngine(wasmModule, { deadlineMs: 100 });
    expect(await kind(box.realm('lib').script('spin', 'for (;;) {}'))).toBe('timeout');
    box.dispose();
  });

  it('stops memory bombs at the limit, and the wasm memory stays near it', async () => {
    const box = createEngine(wasmModule, { memoryMB: 16, deadlineMs: 5000 });
    const realm = box.realm('lib');
    const s = await realm.script(
      'bomb',
      'function numbers() { const a = []; for (let i = 0; ; i++) a.push(i) } function objects() { const a = []; for (;;) a.push({ x: 1, y: [2] }) }',
    );
    expect(await kind(s.call('numbers', []))).toBe('memory');
    expect(await kind(s.call('objects', []))).toBe('memory');
    const bytes = (realm as EngineRealm).module!.getWasmMemory().buffer.byteLength;
    expect(bytes).toBeLessThan(128 * 1024 * 1024);
    box.dispose();
  });

  it('leaves out typed arrays (whose storage escapes the memory limit), Promise and Proxy', async () => {
    const box = createEngine(wasmModule);
    const names = ['ArrayBuffer', 'SharedArrayBuffer', 'DataView', 'Uint8Array', 'Float64Array', 'Atomics', 'Promise', 'Proxy'];
    const s = await box.realm('lib').script('probe', 'function probe(names) { return names.filter(n => typeof globalThis[n] !== "undefined") }');
    expect(await s.call('probe', [names])).toEqual([]);
    box.dispose();
  });

  it('frees what each call passes in: many calls do not grow the memory', async () => {
    const box = createEngine(wasmModule);
    const realm = box.realm('lib');
    const s = await realm.script('echo', 'function echo(text) { return text.length }');
    const text = 'x'.repeat(4096);
    const bytes = () => (realm as EngineRealm).module!.getWasmMemory().buffer.byteLength;
    for (let i = 0; i < 200; i++) await s.call('echo', [text]);
    const before = bytes();
    for (let i = 0; i < 20000; i++) await s.call('echo', [text]);
    // 20000 leaked pairs of 4 KB strings would be well over 160 MB
    expect(bytes() - before).toBeLessThan(8 * 1024 * 1024);
    box.dispose();
  });

  it('refuses an oversized result', async () => {
    const box = createEngine(wasmModule, { maxOutputKB: 1 });
    const s = await box.realm('lib').script('big', 'function big() { return "x".repeat(5000) }');
    expect(await kind(s.call('big', []))).toBe('output');
    box.dispose();
  });
});

describe('isolation', () => {
  // A malicious script runs first and replaces built-ins the normal one uses
  const evil = `
    globalThis.stolen = [];
    const map = Array.prototype.map;
    Array.prototype.map = function (f) { stolen.push(String(f)); return map.call(this, () => 999) };
    const s = JSON.stringify; JSON.stringify = v => s(v) + ' <tampered>';
    function loot() { return { stolen, victim: typeof widget } }`;
  const victim = 'function widget(k) { return [1, 2, 3].map(x => x * k) }';

  it('a script in one realm can neither tamper with nor read a script in another', async () => {
    const box = createEngine(wasmModule);
    const bad = await box.realm('theirs').script('evil', evil);
    const good = await box.realm('mine').script('widget', victim);
    expect(await good.call('widget', [2])).toEqual([2, 4, 6]);
    expect(await bad.call('loot', [])).toEqual({ stolen: [], victim: 'undefined' });
    box.dispose();
  });

  it('two scripts in the same realm do not see each other', async () => {
    const box = createEngine(wasmModule);
    const realm = box.realm('lib');
    const bad = await realm.script('evil', evil);
    const good = await realm.script('widget', victim);
    expect(await good.call('widget', [2])).toEqual([2, 4, 6]);
    expect(await bad.call('loot', [])).toEqual({ stolen: [], victim: 'undefined' });
    box.dispose();
  });

  it('gives every realm its own wasm instance, and the same script key the same context', async () => {
    const box = createEngine(wasmModule);
    const a = box.realm('a'),
      b = box.realm('b');
    await a.script('s', 'let n = 0; function next() { return ++n }');
    await b.script('s', 'let n = 0; function next() { return ++n }');
    expect((a as EngineRealm).module).toBeDefined();
    expect((a as EngineRealm).module).not.toBe((b as EngineRealm).module);
    expect(box.realm('a')).toBe(a);
    const s1 = await a.script('s', 'ignored: already made');
    await s1.call('next', []);
    expect(await (await a.script('s', '')).call('next', [])).toBe(2);
    box.dispose();
  });

  it('a realm that hangs or crashes leaves the others running, and is rebuilt on next use', async () => {
    const box = createEngine(wasmModule, { deadlineMs: 100 });
    const other = await box.realm('other').script('ok', 'function ok() { return "fine" }');
    const spin = await box.realm('bad').script('spin', 'function spin() { for (;;) {} }');
    expect(await kind(spin.call('spin', []))).toBe('timeout');
    expect(await other.call('ok', [])).toBe('fine');

    // A crash (a wasm trap) discards the realm
    const bad = box.realm('bad') as EngineRealm;
    expect(
      await kind(
        Promise.resolve().then(() =>
          bad.run(() => {
            throw new WebAssembly.RuntimeError('unreachable');
          }),
        ),
      ),
    ).toBe('crash');
    expect(bad.dead).toBe(true);
    expect(await kind(spin.call('spin', []))).toBe('crash');
    expect(await other.call('ok', [])).toBe('fine');
    const again = await box.realm('bad').script('ok', 'function ok() { return "back" }');
    expect(await again.call('ok', [])).toBe('back');
    box.dispose();
  });
});
