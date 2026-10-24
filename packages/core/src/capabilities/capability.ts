/**
 * Capability registry: the UI, the built-in agent and (later) MCP only call capabilities registered here.
 * Each capability is registered (name, description, input schema, permission level, examples), takes and returns JSON, and declares its runtime requirements.
 */
import { z } from 'zod';
import { TxError, type Actor, type Session, type TxResult } from '../session/session.js';
import type { Project } from '../model/schema.js';
import { text } from '../i18n.js';

/** Permission level, matching the agent's degree of autonomy */
export type Permission = 'read' | 'reversible' | 'main' | 'external';
export type CapabilityKind = 'query' | 'edit' | 'relation' | 'verify' | 'view';
/** any: runs in the core package alone; browser: needs a browser (rendering, screenshots) */
export type Runtime = 'any' | 'browser';

export interface CapabilityContext {
  session: Session;
  actor: Actor;
  /** Extra context injected by the browser runtime (view, screenshots) */
  host?: Record<string, unknown>;
}

interface Base<I extends z.ZodType> {
  name: string;
  title: string;
  description: string;
  kind: CapabilityKind;
  permission: Permission;
  runtime: Runtime;
  input: I;
  examples?: { input: z.input<I>; note: string }[];
}

/** Mutation: changes data inside a transaction */
export interface EditCapability<I extends z.ZodType = z.ZodType, R = unknown> extends Base<I> {
  mode: 'edit';
  /** One-line summary written to the operation log */
  label: (input: z.output<I>, p: Project) => string;
  /** Asynchronous work before the transaction (e.g. checking a recipe); may return the input to apply instead, or throw a TxError */
  prepare?: (input: z.output<I>, ctx: CapabilityContext) => Promise<z.output<I> | void>;
  apply: (draft: Project, input: z.output<I>, ctx: CapabilityContext) => R;
}

/** Query or host: read-only, or acts on the view */
export interface ReadCapability<I extends z.ZodType = z.ZodType, R = unknown> extends Base<I> {
  mode: 'read';
  run: (input: z.output<I>, ctx: CapabilityContext) => R | Promise<R>;
}

/** Session operation: changes the project outside a transaction (undo, redo replay recorded patches), so it is gated like an edit */
export interface SessionCapability<I extends z.ZodType = z.ZodType, R = unknown> extends Base<I> {
  mode: 'session';
  run: (input: z.output<I>, ctx: CapabilityContext) => R | Promise<R>;
}

export type Capability = EditCapability<any, any> | ReadCapability<any, any> | SessionCapability<any, any>;

/** Whether calling the capability can change the project (edits and session operations) */
export const mutates = (c: Capability) => c.mode !== 'read';

/** Capability title in the UI language (`title` itself is the English title, also used for the LLM) */
export const capabilityTitle = (c: { name: string; title: string }) => text(`cap_${c.name}`, c.title);

/** kind, permission and runtime may be left out when they are the defaults */
type Definition<C> = Omit<C, 'mode' | 'kind' | 'permission' | 'runtime'> & Partial<Pick<C & Base<z.ZodType>, 'kind' | 'permission' | 'runtime'>>;

/** Edit capability; defaults: kind edit, permission reversible, runtime any */
export const defineEdit = <I extends z.ZodType, R>(c: Definition<EditCapability<I, R>>): EditCapability<I, R> => ({
  kind: 'edit',
  permission: 'reversible',
  runtime: 'any',
  ...c,
  mode: 'edit',
});
/** Read capability; defaults: kind query, permission read, runtime any */
export const defineRead = <I extends z.ZodType, R>(c: Definition<ReadCapability<I, R>>): ReadCapability<I, R> => ({
  kind: 'query',
  permission: 'read',
  runtime: 'any',
  ...c,
  mode: 'read',
});
/** Session operation (undo, redo); defaults like an edit: kind edit, permission reversible, runtime any */
export const defineSession = <I extends z.ZodType, R>(c: Definition<SessionCapability<I, R>>): SessionCapability<I, R> => ({
  kind: 'edit',
  permission: 'reversible',
  runtime: 'any',
  ...c,
  mode: 'session',
});

export interface CallResult {
  ok: boolean;
  /** Result of a mutation */
  result?: unknown;
  error?: { code: string; message: string; details?: unknown };
  changed?: string[];
  warnings?: { code: string; message: string; targets: string[] }[];
  areaChanges?: TxResult['areaChanges'];
}

export class Registry {
  private map = new Map<string, Capability>();

  constructor(caps: Capability[] = []) {
    for (const c of caps) this.register(c);
  }

  register(c: Capability) {
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(c.name)) throw new Error(`Invalid capability name: ${c.name}`);
    if (this.map.has(c.name)) throw new Error(`Capability registered twice: ${c.name}`);
    this.map.set(c.name, c);
    return this;
  }

  get(name: string) {
    return this.map.get(name);
  }

  list() {
    return [...this.map.values()];
  }

  /** Keyword search: the more query words appear in name, title (English and translated) and description, the higher the rank */
  search(query: string, limit = 10) {
    const words = query
      .toLowerCase()
      .split(/[\s,，、]+/)
      .filter(Boolean);
    return this.list()
      .map(c => {
        const hay = `${c.name} ${c.title} ${capabilityTitle(c)} ${c.description}`.toLowerCase();
        return { c, score: words.reduce((s, w) => s + (hay.includes(w) ? 1 : 0), 0) };
      })
      .filter(x => x.score > 0 || !words.length)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(x => describe(x.c));
  }

  /** Call: validate input → run mutations in a transaction → return a serializable result */
  async call(name: string, raw: unknown, ctx: CapabilityContext): Promise<CallResult> {
    const c = this.map.get(name);
    if (!c) return { ok: false, error: { code: 'unknown-capability', message: text('err_unknown_capability', 'No capability named {name}', { name }) } };
    const parsed = c.input.safeParse(raw ?? {});
    if (!parsed.success) {
      return { ok: false, error: { code: 'invalid-input', message: z.prettifyError(parsed.error) } };
    }
    try {
      if (c.mode !== 'edit') return { ok: true, result: await c.run(parsed.data, ctx) };
      const input = (c.prepare && (await c.prepare(parsed.data, ctx))) || parsed.data;
      const tx = ctx.session.transact(c.label(input, ctx.session.project), ctx.actor, d => c.apply(d, input, ctx));
      if (!tx.ok) return { ok: false, error: { code: tx.error!.code, message: tx.error!.message, details: tx.error!.issues } };
      return {
        ok: true,
        result: tx.result,
        changed: tx.changed,
        warnings: tx.warnings.map(({ code, message, targets }) => ({ code, message, targets })),
        areaChanges: tx.areaChanges,
      };
    } catch (e) {
      if (e instanceof TxError) return { ok: false, error: { code: e.code, message: e.message } };
      return { ok: false, error: { code: 'internal', message: e instanceof Error ? e.message : String(e) } };
    }
  }
}

export function describe(c: Capability) {
  return {
    name: c.name,
    title: c.title,
    description: c.description,
    kind: c.kind,
    permission: c.permission,
    runtime: c.runtime,
    input: z.toJSONSchema(c.input, { io: 'input', unrepresentable: 'any' }),
    examples: c.examples ?? [],
  };
}
