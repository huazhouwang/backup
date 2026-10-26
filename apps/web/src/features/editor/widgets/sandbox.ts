/**
 * The widget sandbox (@plinth/sandbox's browser host), started by core the first time a script runs (a widget drawn, or one the
 * agent is trying): its worker and the QuickJS wasm load only then. See packages/core/src/scripts/runner.ts.
 */
import { setScriptSandboxLoader } from '@plinth/core';

setScriptSandboxLoader(() =>
  Promise.all([import('@plinth/sandbox/browser'), import('virtual:sandbox-worker'), import('@jitl/quickjs-wasmfile-release-sync/wasm?url')]).then(
    ([{ createBrowserSandbox }, worker, wasm]) => createBrowserSandbox({ worker: { source: worker.default }, wasmUrl: wasm.default }),
  ),
);
