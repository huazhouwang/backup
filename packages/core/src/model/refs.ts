/** Reference resolution: find objects by ID or by readable name (optionally with a level prefix). */
import { TxError } from '../session/session.js';
import { text } from '../i18n.js';
import { REF_SEPARATOR } from './names.js';
import { projectIndex, type IndexEntry, type ObjectKind } from './project-index.js';
import type { Id, Level, Project } from './schema.js';

export type Kind = ObjectKind;

const KIND_EN: Record<Kind, string> = {
  level: 'level',
  wall: 'wall',
  space: 'space',
  opening: 'opening',
  furniture: 'furniture',
  element: 'element',
  constraint: 'constraint',
};
export const kindText = (k: Kind) => text(`err_kind_${k}`, KIND_EN[k]);
/** Join a list for a message: “a、b” in Chinese, "a, b" in English */
export const listText = (items: string[]) => items.join(text('list_separator', ', '));
const refItem = (name: string, id: string | undefined) => text('err_ref_item', '{name} ({id})', { name, id: id ?? '' });

/** Find an object by ID or name; names may carry a level prefix, e.g. “二层·主卧” or “Level 2·Bedroom” (also `:` / `：`) */
export function resolve<K extends Kind>(p: Project, kind: K, ref: string, level?: string): IndexEntry<K> {
  const all = projectIndex(p).of(kind);
  const byId = all.find(o => o.id === ref);
  if (byId) return byId;
  let name = ref,
    lv = level ? resolveLevel(p, level).id : undefined;
  const m = ref.match(REF_SEPARATOR);
  if (!lv && m && p.levels.some(l => l.name === m[1] || l.id === m[1])) {
    lv = resolveLevel(p, m[1]).id;
    name = m[2];
  }
  const hits = all.filter(o => o.name === name && (!lv || o.level === lv));
  if (hits.length === 1) return hits[0];
  if (hits.length > 1)
    throw new TxError(
      'ambiguous-ref',
      text('err_ambiguous_ref', '{count} objects of type {kind} are named “{name}”; use an ID or add a level: {hits}', {
        count: hits.length,
        kind: kindText(kind),
        name,
        hits: listText(hits.map(h => refItem(h.id, h.level))),
      }),
    );
  const near = all.filter(o => o.name.includes(name) || name.includes(o.name)).slice(0, 8);
  if (near.length)
    throw new TxError(
      'not-found',
      text('err_not_found_similar', 'Cannot find {kind} “{ref}”; similar: {similar}', {
        kind: kindText(kind),
        ref,
        similar: listText(near.map(h => refItem(h.name, h.id))),
      }),
    );
  throw new TxError('not-found', text('err_not_found', 'Cannot find {kind} “{ref}”', { kind: kindText(kind), ref }));
}

export function resolveLevel(p: Project, ref: string): Level {
  const l = p.levels.find(x => x.id === ref || x.name === ref);
  if (!l)
    throw new TxError(
      'not-found',
      text('err_level_not_found', 'Cannot find level “{ref}”; existing levels: {levels}', { ref, levels: listText(p.levels.map(x => refItem(x.name, x.id))) }),
    );
  return l;
}

export const getWall = (p: Project, ref: string) => resolve(p, 'wall', ref).obj;
export const getSpace = (p: Project, ref: string) => resolve(p, 'space', ref).obj;
export const getFurniture = (p: Project, ref: string) => resolve(p, 'furniture', ref).obj;
export function getOpening(p: Project, ref: string) {
  const e = resolve(p, 'opening', ref);
  return { w: e.wall!, o: e.obj };
}

/** Find an object of any type by name or ID */
export function findAny(p: Project, ref: string): Id {
  const kinds: Kind[] = ['space', 'wall', 'opening', 'furniture', 'element', 'level', 'constraint'];
  for (const k of kinds) {
    try {
      return resolve(p, k, ref).id;
    } catch (e) {
      if (e instanceof TxError && e.code === 'ambiguous-ref') throw e;
    }
  }
  throw new TxError('not-found', text('err_object_not_found', 'Cannot find “{ref}”. Try searching with find_objects first', { ref }));
}
