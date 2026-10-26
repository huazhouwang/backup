# @plinth/sandbox

Runs untrusted JavaScript safely: QuickJS compiled to WebAssembly, isolated by **realm** and **script**. It knows nothing of widgets, looks or libraries; the caller chooses the keys, and with them who shares what (the policy lives in `@plinth/core`, see #158).

```ts
const realm = sandbox.realm(realmKey); // one wasm instance, with its own memory, created on first use
const script = await realm.script(scriptKey, source); // one QuickJS context in it, with its own globals and built-ins
await script.setData('project', json); // kept inside as a deep-frozen global, until set again
const out = await script.call('widget', [params]); // JSON in, JSON out
realm.dispose(); // drops the instance and all its scripts
```

Errors are `SandboxError` with a `kind`:

- `script`: the guest threw;
- `timeout`: it overran the deadline;
- `memory`: it hit the memory limit;
- `output`: its result was too large;
- `crash`: the realm (or the worker hosting it) failed and was discarded; it is rebuilt on next use.

## Hosts

- **In place**: `createEngine(wasmModule, options)` from `@plinth/sandbox`, given the compiled module (compile it once).
- **Cloudflare Workers**: `createSandbox(options)` from `@plinth/sandbox/workerd`. Workers can't compile wasm from bytes, so the module is imported (wrangler's CompiledWasm rule).
- **Browser**: `createBrowserSandbox({ workerUrl, wasmUrl, ...options })` from `@plinth/sandbox/browser`.
  - The engine runs in a dedicated worker started from a hidden iframe with an opaque origin (`sandbox="allow-scripts"`, no `allow-same-origin`). A Content Security Policy allows no network.
  - `workerUrl` is `src/worker.ts` bundled as a classic script (IIFE): a module worker can't start from an opaque origin.
  - A watchdog replaces a worker that stops answering. The next request starts a new one, remaking its scripts from source and sending their data again.

## Guarantees and their tests

- **Source only, never bytecode.** No bytecode API is used anywhere in `src` (checked by a test). This keeps the engine's bytecode reader, where CVE-2025-46687, CVE-2025-46688 and CVE-2026-88378 are, out of reach.
- **No host functions, no standard library.** The guest has none of `fetch`, `XMLHttpRequest`, `window`, `process`, `require`, `setTimeout`, `WebAssembly`, `importScripts`, `std`, `os`, `console`…; `import()` and `import` statements load nothing.
- **Fewer built-ins** (`INTRINSICS` in `engine.ts`):
  - no typed arrays or `ArrayBuffer`: their storage escapes the runtime's memory limit (with a 16 MB limit a script reached 2 GB), and many engine CVEs were there;
  - no `Promise`: nothing runs pending jobs, so scripts are synchronous;
  - no `Proxy`.
- **Limits per realm**: memory (default 32 MB), stack (512 KB), a deadline per evaluation or call (200 ms), result size (4 MB).
  - The deadline is checked between operations, so one long native operation can overrun it; memory bounds that, and in the browser the watchdog bounds it.
  - Out of memory, QuickJS may throw `null` instead of an error; that is reported as `memory`.
- **Isolation.** A script in one realm can neither tamper with nor read a script in another. Two scripts in one realm don't see each other's globals. Every realm is a fresh instantiation of the compiled module, never reused for another key. A realm that hangs or crashes leaves the others running.
- **Browser host**: the worker's origin is `null`, network and storage are blocked, the page can't reach into the iframe, and a hung worker is replaced (`test/browser`, needs Playwright's Chromium: `npm run test:browser -w @plinth/sandbox`).
- **Workers**: runs in workerd, where the host's own `new Function` is blocked (`test/workerd.test.ts`).

## Engine version

`quickjs-emscripten` 0.32.0 with the `@jitl/quickjs-wasmfile-release-sync` variant: Bellard's QuickJS 2025-09-13 plus commits up to [`f1139494`](https://github.com/bellard/quickjs/commit/f1139494d18a2053630c5ed3384a42bb70db3c53) (2025-12-22).

Checked against the published QuickJS CVEs (NVD, October 2026):

- **CVE-2025-62490 … 62496**: fixed on 2025-08-25, before the 2025-09-13 release:
  - `4e0d0b7` side effects in `JS_PrintValue`;
  - `c927eca` `js_typed_array_indexOf` (shared by `indexOf` and `lastIndexOf`);
  - `9ce5442` `js_bigint_to_string1`;
  - `1168c21` `OP_add_loc` type confusion;
  - `e1c18be` `js_bigint_from_string`;
  - `d9ec8f1` bytecode size limit (libregexp overflow).
- **CVE-2025-12745** (`ArrayBuffer.prototype.slice`): fixed by `c6fe5a9`, an ancestor of `f1139494`. Typed arrays are left out anyway.
- **CVE-2025-69653 and CVE-2025-69654**: fixed by `1dbba8a` and `fcd33c1`, ancestors of `f1139494`.
- **CVE-2026-88378** (`JS_ReadFunctionTag`, bytecode reader): not fixed in this build, and unreachable since no bytecode is ever loaded.
- **QuickJS-NG CVEs** (e.g. CVE-2026-37630 in 0.12.1): not this engine. The QuickJS-NG variant is deliberately not used.

## Upkeep

- Watch the advisories of [bellard/quickjs](https://github.com/bellard/quickjs) and NVD entries for "quickjs". For each new one, check whether it is reachable here: engine core, given the two rules and the left-out built-ins.
- **If an engine-core CVE is published and `quickjs-emscripten` hasn't shipped a fix within a few weeks, build the wasm ourselves.** That is NGINX's approach with njs: follow upstream rather than wait for a packager.
  1. Clone [justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten). It needs `node`, `yarn`, `make` and `emscripten`, or Docker as a fallback on x64.
  2. Update the vendored source: `yarn vendor:update` takes the latest upstream; for a specific commit, replace `vendor/quickjs` with that commit's sources.
  3. Build: `yarn build:codegen && yarn build:packages`.
  4. Take the built `packages/variant-quickjs-wasmfile-release-sync`, pack it (`npm pack`), and point this package's dependency at the tarball (`file:`), keeping `quickjs-emscripten-core` at the matching version.
  5. Run all of this package's tests, including `test:browser`, then update "Engine version" above.

  These steps follow quickjs-emscripten's README and haven't been run here yet: check them the first time they're needed.
