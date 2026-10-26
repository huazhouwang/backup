/**
 * The sandbox engine: untrusted JavaScript run by QuickJS compiled to WebAssembly. A realm is one wasm instance with its own
 * linear memory; a script is one QuickJS context in a realm, with its own globals and built-ins. Callers choose the keys, and so
 * who shares what (the policy lives with them; see #158). Every realm is a fresh instantiation of the one compiled module, never
 * reused for another key.
 *
 * Two rules hold throughout: only source is ever evaluated (no bytecode is loaded, so the engine's bytecode reader is out of
 * reach), and the guest gets no host functions and no standard library. Data goes in and results come out as JSON text.
 */
import base from '@jitl/quickjs-wasmfile-release-sync';
import {
  newQuickJSWASMModuleFromVariant,
  newVariant,
  shouldInterruptAfterDeadline,
  type QuickJSContext,
  type QuickJSHandle,
  type QuickJSRuntime,
  type QuickJSSyncVariant,
  type QuickJSWASMModule,
} from 'quickjs-emscripten-core';
import { SandboxError, type Realm, type Sandbox, type SandboxOptions, type Script } from './types.js';

/**
 * The language features a context gets. Left out:
 * - typed arrays and ArrayBuffer: their storage escapes the runtime's memory limit (a 16 MB realm grew to 2 GB), and they are
 *   where many engine CVEs were;
 * - Promise: nothing runs pending jobs, so a script is synchronous;
 * - Proxy: not needed for computing from JSON, less engine surface.
 * Eval stays: the host evaluates scripts through it.
 */
const INTRINSICS = { BaseObjects: true, Date: true, Eval: true, StringNormalize: true, RegExp: true, RegExpCompiler: true, JSON: true, MapSet: true };

export const DEFAULTS: Required<SandboxOptions> = { memoryMB: 32, stackKB: 512, deadlineMs: 200, maxOutputKB: 4096 };

/**
 * Defined in every context before its script, so it holds the built-ins as they were: data is parsed and deep-frozen, results
 * are serialized. A script can still change these globals, but only inside its own context.
 */
const HELPERS = `(() => {
  const parse = JSON.parse, stringify = JSON.stringify, freeze = Object.freeze, keys = Object.keys, define = Object.defineProperty;
  const deep = v => { if (v !== null && typeof v === 'object') { freeze(v); for (const k of keys(v)) deep(v[k]); } return v; };
  return {
    set(name, text) { define(globalThis, name, { value: deep(parse(text)), writable: false, enumerable: true, configurable: true }); },
    call(name, text) {
      const f = globalThis[name];
      if (typeof f !== 'function') throw new TypeError(name + ' is not a function');
      const out = f(...parse(text));
      return out === undefined ? 'null' : stringify(out);
    },
  };
})()`;

class EngineScript implements Script {
  constructor(
    private realm: EngineRealm,
    private vm: QuickJSContext,
    private helpers: { set: QuickJSHandle; call: QuickJSHandle },
  ) {}

  async setData(name: string, value: unknown) {
    this.realm.run(() => this.invoke(this.helpers.set, name, JSON.stringify(value)));
  }

  async call(fn: string, args: unknown[]) {
    const text = this.realm.run(() => this.invoke(this.helpers.call, fn, JSON.stringify(args)));
    if (text.length > this.realm.options.maxOutputKB * 1024) throw new SandboxError('output', `output over ${this.realm.options.maxOutputKB} KB`);
    return JSON.parse(text) as unknown;
  }

  private invoke(fn: QuickJSHandle, a: string, b: string): string {
    const vm = this.vm;
    const ha = vm.newString(a),
      hb = vm.newString(b);
    const out = vm.callFunction(fn, vm.undefined, ha, hb);
    ha.dispose();
    hb.dispose();
    if (out.error) throw guestError(vm, out.error);
    const value = vm.typeof(out.value) === 'string' ? vm.getString(out.value) : '';
    out.value.dispose();
    return value;
  }

  dispose() {
    this.helpers.set.dispose();
    this.helpers.call.dispose();
    this.vm.dispose();
  }
}

/**
 * A guest exception as a SandboxError: the deadline and the memory limit have their own kinds. Out of memory, QuickJS may not
 * even manage to allocate the error and throws null instead (a script throwing null itself reads the same, harmlessly).
 */
function guestError(vm: QuickJSContext, handle: QuickJSHandle) {
  const e = vm.dump(handle) as { name?: string; message?: string } | string | null;
  handle.dispose();
  if (e === null) return new SandboxError('memory', 'out of memory');
  const message = typeof e === 'string' ? e : `${e?.name ?? 'Error'}: ${e?.message ?? ''}`;
  if (/interrupted/i.test(message)) return new SandboxError('timeout', message);
  if (/out of memory/i.test(message)) return new SandboxError('memory', message);
  return new SandboxError('script', message);
}

export class EngineRealm implements Realm {
  /** The wasm instance (exposed for tests: each realm must have its own) */
  module?: QuickJSWASMModule;
  private rt?: QuickJSRuntime;
  private scripts = new Map<string, EngineScript>();
  private pending = new Map<string, Promise<EngineScript>>();
  private starting?: Promise<void>;
  dead = false;

  constructor(
    private variant: QuickJSSyncVariant,
    readonly options: Required<SandboxOptions>,
    private onDead: () => void,
  ) {}

  private start() {
    this.starting ??= newQuickJSWASMModuleFromVariant(this.variant).then(module => {
      this.module = module;
      const rt = module.newRuntime();
      rt.setMemoryLimit(this.options.memoryMB * 1024 * 1024);
      rt.setMaxStackSize(this.options.stackKB * 1024);
      this.rt = rt;
    });
    return this.starting;
  }

  /** Runs host code against this realm under the deadline. A failure that isn't a guest exception (a wasm trap) kills the realm. */
  run<T>(f: () => T): T {
    if (this.dead) throw new SandboxError('crash', 'realm was discarded');
    this.rt!.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + this.options.deadlineMs));
    try {
      return f();
    } catch (e) {
      if (e instanceof SandboxError) throw e;
      this.kill();
      throw new SandboxError('crash', e instanceof Error ? e.message : String(e));
    } finally {
      if (!this.dead) this.rt!.removeInterruptHandler();
    }
  }

  script(key: string, source: string): Promise<Script> {
    const known = this.scripts.get(key);
    if (known) return Promise.resolve(known);
    let p = this.pending.get(key);
    if (!p) {
      p = this.make(key, source).finally(() => this.pending.delete(key));
      this.pending.set(key, p);
    }
    return p;
  }

  private async make(key: string, source: string) {
    await this.start();
    const vm = this.rt!.newContext({ intrinsics: INTRINSICS });
    let made: EngineScript;
    try {
      made = this.run(() => {
        const h = vm.evalCode(HELPERS, 'helpers.js');
        if (h.error) throw guestError(vm, h.error);
        const helpers = { set: vm.getProp(h.value, 'set'), call: vm.getProp(h.value, 'call') };
        h.value.dispose();
        const r = vm.evalCode(source, `${key}.js`, { type: 'global' });
        if (r.error) {
          helpers.set.dispose();
          helpers.call.dispose();
          throw guestError(vm, r.error);
        }
        r.value.dispose();
        return new EngineScript(this, vm, helpers);
      });
    } catch (e) {
      if (!this.dead) vm.dispose();
      throw e;
    }
    this.scripts.set(key, made);
    return made;
  }

  private kill() {
    this.dead = true;
    this.scripts.clear();
    // After a trap the instance can't be trusted to free itself; drop it for the garbage collector
    this.rt = undefined;
    this.module = undefined;
    this.onDead();
  }

  dispose() {
    if (this.dead) return;
    try {
      for (const s of this.scripts.values()) s.dispose();
      this.rt?.dispose();
    } catch {
      // A script can leave jobs queued (import() with nothing to run them), and QuickJS then asserts on freeing the runtime;
      // the instance is being dropped either way
    }
    this.scripts.clear();
    this.dead = true;
    this.onDead();
  }
}

/** A sandbox over a compiled QuickJS wasm module (each host compiles or imports it once) */
export function createEngine(wasmModule: WebAssembly.Module, options: SandboxOptions = {}): Sandbox {
  const opts = { ...DEFAULTS, ...options };
  // Its typings resolve to the CommonJS build's namespace under NodeNext; the default export is the variant
  const variant = newVariant(base as unknown as QuickJSSyncVariant, { wasmModule });
  const realms = new Map<string, EngineRealm>();
  return {
    realm(key) {
      let r = realms.get(key);
      if (!r || r.dead) {
        const made: EngineRealm = new EngineRealm(variant, opts, () => realms.get(key) === made && realms.delete(key));
        r = made;
        realms.set(key, r);
      }
      return r;
    },
    dispose() {
      // Disposing a realm removes it from the map: iterate over a copy
      const all = Array.from(realms.values());
      realms.clear();
      for (const r of all) r.dispose();
    },
  };
}
