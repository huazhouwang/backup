/** The compiled QuickJS module for tests (hosts compile or import it once), and the sample project */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
export const wasmPath = require.resolve('@jitl/quickjs-wasmfile-release-sync/wasm');
export const wasmModule = await WebAssembly.compile(readFileSync(wasmPath));
export const sampleProject = JSON.parse(readFileSync(join(import.meta.dirname, '../../../samples/wushi-10/project.json'), 'utf8'));
