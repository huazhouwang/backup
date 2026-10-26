/** The sandbox's interface, the same for every host (in place, or the browser's isolated worker) */

export interface SandboxOptions {
  /** Memory limit of each realm */
  memoryMB?: number;
  /** Stack limit of each realm */
  stackKB?: number;
  /** How long one evaluation or call may run before it is interrupted */
  deadlineMs?: number;
  /** The largest result a call may return, as JSON */
  maxOutputKB?: number;
}

/**
 * Why a sandbox operation failed:
 * - script: the guest threw;
 * - timeout: it overran the deadline;
 * - memory: it hit the memory limit;
 * - output: its result was too large;
 * - crash: the realm (or the worker hosting it) failed and was discarded; it is rebuilt on next use.
 */
export type SandboxErrorKind = 'script' | 'timeout' | 'memory' | 'output' | 'crash';

export class SandboxError extends Error {
  constructor(
    readonly kind: SandboxErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'SandboxError';
  }
}

export interface Script {
  /** Data kept in the script's context as a deep-frozen global, until set again */
  setData(name: string, value: unknown): Promise<void>;
  /** Calls a global function of the script with JSON arguments; resolves to its JSON result */
  call(fn: string, args: unknown[]): Promise<unknown>;
}

export interface Realm {
  /** The script with this key in this realm: evaluated on first use, then kept */
  script(key: string, source: string): Promise<Script>;
  /** Drops the wasm instance and all its scripts */
  dispose(): void;
}

export interface Sandbox {
  /** The realm with this key: a wasm instance of its own, created on first use */
  realm(key: string): Realm;
  dispose(): void;
}
