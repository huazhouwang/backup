/**
 * Lookup of every object in a project by ID: its kind, name, level and the object itself.
 * Projects are immutable between transactions, so the index is cached per project object; inside a transaction
 * (an immer draft that the recipe is still changing) it is rebuilt on every call.
 */
import { isDraft } from 'immer';
import type { Constraint, Element, Furniture, Id, Level, Opening, Project, Space, Wall } from './schema.js';

export type ObjectKind = 'level' | 'wall' | 'opening' | 'space' | 'furniture' | 'element' | 'constraint';

interface ObjectOf {
  level: Level;
  wall: Wall;
  opening: Opening;
  space: Space;
  furniture: Furniture;
  element: Element;
  constraint: Constraint;
}

export type IndexEntry<K extends ObjectKind = ObjectKind> = {
  [T in K]: {
    kind: T;
    id: Id;
    name: string;
    /** Level the object is on; a level's own ID for levels; none for constraints */
    level?: Id;
    obj: ObjectOf[T];
    /** Host wall of an opening */
    wall?: Wall;
  };
}[K];

export interface ProjectIndex {
  get(id: Id): IndexEntry | undefined;
  /** Objects of one kind, in project order */
  of<K extends ObjectKind>(kind: K): IndexEntry<K>[];
}

const cache = new WeakMap<Project, ProjectIndex>();

function build(p: Project): ProjectIndex {
  const byKind: { [K in ObjectKind]: IndexEntry<K>[] } = {
    level: p.levels.map(l => ({ kind: 'level', id: l.id, name: l.name, level: l.id, obj: l })),
    wall: p.walls.map(w => ({ kind: 'wall', id: w.id, name: w.name, level: w.level, obj: w })),
    opening: p.walls.flatMap(w => w.openings.map(o => ({ kind: 'opening' as const, id: o.id, name: o.name, level: w.level, obj: o, wall: w }))),
    space: p.spaces.map(s => ({ kind: 'space', id: s.id, name: s.name, level: s.level, obj: s })),
    furniture: p.furniture.map(f => ({ kind: 'furniture', id: f.id, name: f.name, level: f.level, obj: f })),
    element: p.elements.map(e => ({ kind: 'element', id: e.id, name: e.name, level: e.level, obj: e })),
    constraint: p.constraints.map(c => ({ kind: 'constraint', id: c.id, name: c.note ?? c.id, obj: c })),
  };
  const byId = new Map<Id, IndexEntry>();
  for (const list of Object.values(byKind)) for (const e of list) if (!byId.has(e.id)) byId.set(e.id, e);
  return {
    get: id => byId.get(id),
    of: kind => byKind[kind],
  };
}

export function projectIndex(p: Project): ProjectIndex {
  if (isDraft(p)) return build(p);
  let ix = cache.get(p);
  if (!ix) cache.set(p, (ix = build(p)));
  return ix;
}

/** The object with this ID, or undefined (optionally only if it is of the given kind) */
export function findObject<K extends ObjectKind>(p: Project, id: Id, kind?: K): IndexEntry<K> | undefined {
  const e = projectIndex(p).get(id);
  return e && (!kind || e.kind === kind) ? (e as IndexEntry<K>) : undefined;
}
