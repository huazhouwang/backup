/**
 * The widget sandbox (@plinth/sandbox's browser host), started once when the first widget needs it: its worker and the QuickJS
 * wasm load only then. Installed into core, which runs widget scripts through it (see packages/core/src/scripts/runner.ts).
 */
import { hasScriptSandbox, setScriptSandbox } from '@plinth/core';

let starting: Promise<void> | null = null;

export function ensureWidgetSandbox(): Promise<void> {
  if (hasScriptSandbox()) return Promise.resolve();
  starting ??= Promise.all([import('@plinth/sandbox/browser'), import('virtual:sandbox-worker'), import('@jitl/quickjs-wasmfile-release-sync/wasm?url')]).then(
    ([{ createBrowserSandbox }, worker, wasm]) => {
      setScriptSandbox(createBrowserSandbox({ worker: { source: worker.default }, wasmUrl: wasm.default }));
    },
  );
  return starting;
}
