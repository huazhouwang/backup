/**
 * Editing session: every change is a transaction. The pipeline is fixed: validate → apply → drop dangling constraints → re-solve constraints → check rules → log;
 * if any step fails the whole transaction rolls back. Undo / redo is based on immer patches.
 */
import { applyPatches, current, enablePatches, produceWithPatches, setAutoFreeze, type Patch } from 'immer';
import { derived } from '../model/derived.js';
import { issueKey, type Issue } from '../rules/rules.js';
import { pruneConstraints, solveConstraints, type ConstraintReport } from '../rules/constraints.js';
import type { Id, Project } from '../model/schema.js';
import { text } from '../i18n.js';

/** Join several messages into one: “a；b” in Chinese, "a; b" in English */
const joinMessages = (items: string[]) => items.join(text('message_separator', '; '));

enablePatches();
setAutoFreeze(false);

/** Why the project changed: a transaction, undo / redo, or a whole new project loaded (not an edit) */
export type ChangeReason = 'tx' | 'undo' | 'redo' | 'load';

export type Actor = { kind: 'user' | 'agent' | 'external'; id?: string; name?: string };

export interface LogEntry {
  id: number;
  at: string;
  actor: Actor;
  label: string;
  reason?: string;
  changed: Id[];
}

interface HistoryEntry extends LogEntry {
  patches: Patch[];
  inverse: Patch[];
}

export interface AreaChange {
  id: Id;
  name: string;
  level: Id;
  before: number | null;
  after: number | null;
}

export interface TxResult<R = unknown> {
  ok: boolean;
  result?: R;
  error?: { code: string; message: string; issues?: Issue[] };
  /** IDs of changed objects, so the UI can highlight changes and frame the camera */
  changed: Id[];
  /** Warnings newly introduced by the operation */
  warnings: Issue[];
  areaChanges: AreaChange[];
  constraints?: ConstraintReport;
}

export class TxError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Find the IDs of changed objects from patch paths */
function changedIds(before: Project, after: Project, patches: Patch[]): Id[] {
  const ids = new Set<Id>();
  for (const p of patches) {
    const [coll, idx, sub, subIdx] = p.path as [string, number, string?, number?];
    const pick = (proj: Project) => {
      const list = (proj as any)[coll];
      if (!Array.isArray(list) || typeof idx !== 'number') return;
      const obj = list[idx];
      if (!obj?.id) return;
      if (sub === 'openings' && typeof subIdx === 'number' && obj.openings[subIdx]) ids.add(obj.openings[subIdx].id);
      ids.add(obj.id);
    };
    pick(before);
    pick(after);
  }
  return [...ids];
}

/** Walls and openings moved in this transaction; the constraint solver uses them as anchors */
function touchedGeometry(a: Project, b: Project): Id[] {
  const old = new Map(a.walls.map(w => [w.id, w]));
  const out: Id[] = [];
  for (const w of b.walls) {
    const o = old.get(w.id);
    if (!o || o.start.join() !== w.start.join() || o.end.join() !== w.end.join()) out.push(w.id);
    const oo = new Map((o?.openings ?? []).map(x => [x.id, x]));
    for (const op of w.openings) if (oo.get(op.id)?.at !== op.at) out.push(op.id);
  }
  return out;
}

function areaSnapshot(p: Project) {
  const m = new Map<Id, { name: string; level: Id; net: number }>();
  for (const l of derived(p).areas.levels) for (const s of l.spaces) m.set(s.id, { name: s.name, level: l.id, net: s.net });
  return m;
}

function diffAreas(a: ReturnType<typeof areaSnapshot>, b: ReturnType<typeof areaSnapshot>): AreaChange[] {
  const out: AreaChange[] = [];
  for (const id of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(id),
      y = b.get(id);
    const before = x ? Math.round(x.net * 100) / 100 : null,
      after = y ? Math.round(y.net * 100) / 100 : null;
    if (before !== after) out.push({ id, name: (y ?? x)!.name, level: (y ?? x)!.level, before, after });
  }
  return out;
}

export class Session {
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  private listeners = new Set<(p: Project, reason: ChangeReason) => void>();
  private seq = 0;
  readonly log: LogEntry[] = [];

  constructor(public project: Project) {}

  subscribe(fn: (p: Project, reason: ChangeReason) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(reason: ChangeReason) {
    for (const fn of this.listeners) fn(this.project, reason);
  }

  /** Replace the whole project (load a new version) and clear history and the operation log */
  load(p: Project) {
    this.project = p;
    this.past = [];
    this.future = [];
    this.log.length = 0;
    this.emit('load');
  }

  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }

  /** Read-only access: not in a transaction */
  read<R>(fn: (p: Project) => R): R {
    return fn(this.project);
  }

  transact<R>(label: string, actor: Actor, recipe: (draft: Project) => R, opts: { reason?: string } = {}): TxResult<R> {
    const before = this.project;
    let result: R | undefined;
    let patches: Patch[], inverse: Patch[], next: Project;
    let constraints: ConstraintReport | undefined;
    try {
      [next, patches, inverse] = produceWithPatches(before, draft => {
        result = recipe(draft as Project);
        // Constraints on objects the recipe deleted go with them, so capabilities don't each have to clean up
        pruneConstraints(draft as Project);
        constraints = solveConstraints(draft as Project, touchedGeometry(before, current(draft) as Project));
        if (constraints.violatedHard.length) {
          throw new TxError(
            'constraint-violated',
            text('err_constraint_violated', 'Hard constraint violated: {constraints}', {
              constraints: joinMessages(constraints.violatedHard.map(c => c.message)),
            }),
          );
        }
      });
    } catch (e) {
      if (e instanceof TxError) return { ok: false, error: { code: e.code, message: e.message }, changed: [], warnings: [], areaChanges: [] };
      throw e;
    }
    if (!patches.length) return { ok: true, result, changed: [], warnings: [], areaChanges: [], constraints };

    // Rule check: only block newly introduced errors; pre-existing problems do not block the change.
    // `before` is usually the previous transaction's `next`, so its results are already cached.
    const old = new Set(derived(before).rules.map(issueKey));
    const fresh = derived(next).rules.filter(i => !old.has(issueKey(i)));
    const errors = fresh.filter(i => i.severity === 'error');
    if (errors.length) {
      return {
        ok: false,
        error: { code: 'rule-violated', message: joinMessages(errors.map(e => e.message)), issues: errors },
        changed: [],
        warnings: [],
        areaChanges: [],
      };
    }

    const changed = changedIds(before, next, patches);
    const entry: HistoryEntry = {
      id: ++this.seq,
      at: new Date().toISOString(),
      actor,
      label,
      reason: opts.reason,
      changed,
      patches,
      inverse,
    };
    this.project = next;
    this.past.push(entry);
    this.future = [];
    this.log.push({ id: entry.id, at: entry.at, actor, label, reason: opts.reason, changed });
    this.emit('tx');
    return {
      ok: true,
      result,
      changed,
      warnings: fresh.filter(i => i.severity === 'warning'),
      areaChanges: diffAreas(areaSnapshot(before), areaSnapshot(next)),
      constraints,
    };
  }

  undo(): LogEntry | null {
    const e = this.past.pop();
    if (!e) return null;
    this.project = applyPatches(this.project, e.inverse);
    this.future.push(e);
    this.emit('undo');
    return e;
  }

  redo(): LogEntry | null {
    const e = this.future.pop();
    if (!e) return null;
    this.project = applyPatches(this.project, e.patches);
    this.past.push(e);
    this.emit('redo');
    return e;
  }
}
