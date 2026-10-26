/**
 * The bridge between the editor and the sandboxed canvas page (issue 171): the messages each side sends, and the design's changes
 * as they cross it. The page keeps its own copy of the design; after the first message only what changed is sent: the top-level
 * fields whose value changed, and for lists of objects with ids (walls, spaces, furniture…) the items that changed, the ids that
 * went and the new order. Changes are found by identity, which the editor's immutable updates keep for whatever didn't change.
 */
import type { Project } from '@plinth/core';

/** What a capability call answers (the registry's result, as plain data) */
export interface CallReply {
  ok: boolean;
  result?: unknown;
  error?: { code: string; message: string };
}

export interface Init {
  project: Project;
  level: string;
  selection: string[];
  locale: 'zh' | 'en';
  canEdit: boolean;
}

export type HostMessage =
  | ({ type: 'init' } & Init)
  | { type: 'project'; diff: ProjectDiff; sentAt: number }
  | { type: 'level'; level: string }
  | { type: 'selection'; ids: string[] }
  | { type: 'canEdit'; canEdit: boolean }
  | { type: 'reply'; id: number; reply: CallReply };

export type PageMessage =
  | { type: 'ready'; perf: { firstDrawMs: number; bundleBytes: number } }
  | { type: 'call'; id: number; name: string; input: unknown }
  | { type: 'select'; ids: string[] }
  | { type: 'perf'; name: string; ms: number }
  /** A key pressed in the page that the page didn't use, for the editor's shortcuts (undo, Esc…) */
  | { type: 'key'; key: string; code: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean; repeat: boolean }
  | { type: 'error'; source: string; message: string };

type Item = { id: string };
const isList = (v: unknown): v is Item[] =>
  Array.isArray(v) && v.length > 0 && v.every(x => !!x && typeof x === 'object' && typeof (x as Item).id === 'string');

export interface ListDiff {
  upsert: Item[];
  remove: string[];
  /** The ids in their new order, when it changed */
  order?: string[];
}

export interface ProjectDiff {
  /** Top-level fields replaced whole */
  set: Record<string, unknown>;
  /** Top-level lists of objects with ids, changed item by item */
  lists: Record<string, ListDiff>;
}

/** What changed from `prev` to `next`, by identity; empty when nothing did */
export function diffProject(prev: Project, next: Project): ProjectDiff {
  const set: Record<string, unknown> = {},
    lists: Record<string, ListDiff> = {};
  const a = prev as unknown as Record<string, unknown>,
    b = next as unknown as Record<string, unknown>;
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (a[key] === b[key]) continue;
    const before = a[key],
      after = b[key];
    if (isList(before) && isList(after)) {
      const old = new Map(before.map(x => [x.id, x]));
      const upsert = after.filter(x => old.get(x.id) !== x);
      const ids = new Set(after.map(x => x.id));
      const remove = before.filter(x => !ids.has(x.id)).map(x => x.id);
      const kept = before.filter(x => ids.has(x.id)).map(x => x.id),
        added = after.filter(x => !old.has(x.id)).map(x => x.id);
      const sameOrder = after.map(x => x.id).join('\n') === [...kept, ...added].join('\n');
      lists[key] = { upsert, remove, ...(sameOrder ? {} : { order: after.map(x => x.id) }) };
    } else set[key] = after;
  }
  return { set, lists };
}

export const isEmptyDiff = (d: ProjectDiff) => !Object.keys(d.set).length && !Object.keys(d.lists).length;

/** The design with a diff applied (a new object; unchanged values are kept by identity) */
export function applyDiff(p: Project, d: ProjectDiff): Project {
  const out = { ...(p as unknown as Record<string, unknown>), ...d.set };
  for (const [key, { upsert, remove, order }] of Object.entries(d.lists)) {
    const items = new Map(((out[key] as Item[] | undefined) ?? []).map(x => [x.id, x]));
    for (const id of remove) items.delete(id);
    for (const x of upsert) items.set(x.id, x);
    out[key] = order ? order.flatMap(id => (items.has(id) ? [items.get(id)!] : [])) : [...items.values()];
  }
  return out as unknown as Project;
}
