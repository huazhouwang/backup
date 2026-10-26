/**
 * Running user-written scripts (widgets, and later looks) in the sandbox, with the isolation rule in one place (#158): one realm
 * (a wasm instance with its own memory) per library, since a library is one author; one script (a context with its own globals)
 * per definition, keyed by kind, id, version and a hash of its source. Neither widgets nor looks choose keys themselves.
 *
 * The sandbox is injected by the app (@plinth/sandbox: the browser's isolated worker, or in place on the server), so core stays
 * free of browser and worker code. Its shape is all core needs to know.
 */

/** What core needs of a sandbox (@plinth/sandbox's Sandbox has this shape) */
export interface ScriptSandbox {
  realm(key: string): {
    script(key: string, source: string): Promise<{ setData(name: string, value: unknown): Promise<void>; call(fn: string, args: unknown[]): Promise<unknown> }>;
  };
}

/** Where a library comes from: shipped with the app, a user's own, a team's, or a design's own widgets (id: the project's) */
export type LibraryOrigin = { origin: 'builtin' | 'design'; id: string } | { origin: 'user' | 'team'; owner: string; id: string };

/** A script to run: its library (who wrote it), what it is, and its source */
export interface ScriptRef {
  library: LibraryOrigin;
  kind: 'widget' | 'look';
  id: string;
  version: string;
  source: string;
}

/** Why running a script failed (the sandbox's kinds, plus 'unavailable' when no sandbox is set and 'invalid' for bad output) */
export class ScriptError extends Error {
  constructor(
    readonly kind: 'script' | 'timeout' | 'memory' | 'output' | 'crash' | 'unavailable' | 'invalid',
    message: string,
  ) {
    super(message);
    this.name = 'ScriptError';
  }
}

export const realmKey = (l: LibraryOrigin) => ('owner' in l ? `${l.origin}:${l.owner}:${l.id}` : `${l.origin}:${l.id}`);

/** FNV-1a, 32 bits, as hex: tells sources apart, not a security measure (a library's scripts share its realm anyway) */
export function sourceHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export const scriptKey = (s: Pick<ScriptRef, 'kind' | 'id' | 'version' | 'source'>) => `${s.kind}:${s.id}@${s.version}#${sourceHash(s.source)}`;

let sandbox: ScriptSandbox | null = null;
let loader: (() => Promise<ScriptSandbox>) | null = null;
let loading: Promise<ScriptSandbox> | null = null;
/** Data last sent to each script, by realm, script and name: sent again only when it changes (by identity) */
let sent = new Map<string, unknown>();

/** Install the app's sandbox (null removes it; scripts then fail with 'unavailable') */
export function setScriptSandbox(s: ScriptSandbox | null) {
  sandbox = s;
  sent = new Map();
}

export const hasScriptSandbox = () => sandbox !== null;

/** How to start the sandbox when a script first needs one (the browser loads its worker and the wasm only then) */
export function setScriptSandboxLoader(load: (() => Promise<ScriptSandbox>) | null) {
  loader = load;
  loading = null;
}

async function currentSandbox(): Promise<ScriptSandbox | null> {
  if (sandbox || !loader) return sandbox;
  loading ??= loader().then(
    s => {
      sandbox ??= s;
      return sandbox;
    },
    e => {
      loading = null;
      throw new ScriptError('unavailable', `the script sandbox failed to start: ${e instanceof Error ? e.message : String(e)}`);
    },
  );
  return loading;
}

/**
 * Runs a function of a script with data kept inside it (sent again only when the value changes) and JSON arguments. Sandbox
 * errors come back as ScriptErrors of the same kind.
 */
export async function runSandboxed(ref: ScriptRef, data: Record<string, unknown>, fn: string, args: unknown[]): Promise<unknown> {
  const sandbox = await currentSandbox();
  if (!sandbox) throw new ScriptError('unavailable', 'no script sandbox is set');
  const realm = realmKey(ref.library),
    key = scriptKey(ref);
  try {
    const script = await sandbox.realm(realm).script(key, ref.source);
    for (const [name, value] of Object.entries(data)) {
      const at = `${realm}\n${key}\n${name}`;
      if (sent.get(at) === value) continue;
      await script.setData(name, value);
      sent.set(at, value);
    }
    return await script.call(fn, args);
  } catch (e) {
    if (e instanceof ScriptError) throw e;
    const kind = (e as { kind?: string })?.kind;
    // A replaced realm or worker lost the data: send it again next time
    if (kind === 'crash') for (const k of sent.keys()) if (k.startsWith(`${realm}\n`)) sent.delete(k);
    throw new ScriptError(
      kind === 'script' || kind === 'timeout' || kind === 'memory' || kind === 'output' || kind === 'crash' ? kind : 'crash',
      e instanceof Error ? e.message : String(e),
    );
  }
}
