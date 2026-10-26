/** The in-place host for Cloudflare Workers, which can't compile wasm from bytes: the module is imported (wrangler's CompiledWasm rule) */
import wasm from '@jitl/quickjs-wasmfile-release-sync/wasm';
import { createEngine } from './engine.js';
import type { SandboxOptions } from './types.js';

export const createSandbox = (options?: SandboxOptions) => createEngine(wasm, options);
