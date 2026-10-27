/** @opensu/sandbox: runs untrusted JavaScript safely. Hosts: in place (`createEngine`, given the compiled wasm), `./workerd`, `./browser`. */
export { createEngine } from './engine.js';
export { SandboxError, type Realm, type Sandbox, type SandboxErrorKind, type SandboxOptions, type Script } from './types.js';
