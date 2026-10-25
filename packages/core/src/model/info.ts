/** Object summaries returned by query capabilities (get_object). */
import { grossArea, netArea } from '../geometry/area.js';
import { area, bbox, MIN_SHARED_EDGE, openingCenter, pointInPolygon, round, scale, wallLength, wallNormal } from '../geometry/geometry.js';
import { openingSpaces, sharedLength, sideOf, spaceNeighbors, spaceWalls } from '../geometry/topology.js';
import { directionOf, names } from './names.js';
import { findObject } from './project-index.js';
import type { Id, Opening, Project, Space, Wall } from './schema.js';

export const r2 = (n: number) => Math.round(n * 100) / 100;

export function wallInfo(p: Project, w: Wall) {
  const sides = p.spaces
    .filter(s => s.level === w.level && sharedLength(w, s) > MIN_SHARED_EDGE)
    .map(s => ({ space: s.name, id: s.id, side: sideOf(w, s) === 1 ? 'right' : 'left' }));
  return {
    id: w.id,
    name: w.name,
    type: 'wall' as const,
    level: w.level,
    kind: w.kind,
    start: w.start,
    end: w.end,
    length: Math.round(wallLength(w)),
    thickness: w.thickness,
    height: w.height ?? null,
    spaces: sides,
    openings: w.openings.map(o => ({ id: o.id, name: o.name, kind: o.kind, at: o.at, width: o.width, height: o.height, sill: o.sill })),
  };
}

export function spaceInfo(p: Project, s: Space) {
  const vocab = names(p);
  const walls = spaceWalls(p, s).map(b => {
    const toWall = scale(wallNormal(b.wall), -b.side);
    return {
      id: b.wall.id,
      name: b.wall.name,
      direction: vocab.direction[directionOf(toWall)],
      length: Math.round(b.length),
      kind: b.wall.kind,
      openings: b.wall.openings.map(o => o.name),
    };
  });
  const [x0, y0, x1, y1] = bbox(s.shape);
  return {
    id: s.id,
    name: s.name,
    type: 'space' as const,
    level: s.level,
    kind: s.kind,
    floor: s.floor,
    netArea: r2(netArea(s, p.walls)),
    axisArea: r2(area(s.shape) / 1e6),
    bounds: { x: x0, y: y0, width: x1 - x0, depth: y1 - y0 },
    shape: s.shape,
    walls,
    neighbors: spaceNeighbors(p, s).map(n => ({ id: n.space.id, name: n.space.name, via: n.via.map(w => w.name) })),
    furniture: p.furniture.filter(f => f.level === s.level && s.shape.some(q => pointInPolygon(f.position, q))).map(f => ({ id: f.id, name: f.name })),
  };
}

export function openingInfo(p: Project, w: Wall, o: Opening) {
  return {
    ...o,
    type: 'opening' as const,
    level: w.level,
    wall: { id: w.id, name: w.name },
    center: round(openingCenter(w, o)),
    connects: openingSpaces(p, w, o).map(s => ({ id: s.id, name: s.name })),
  };
}

export function objectInfo(p: Project, id: Id) {
  const e = findObject(p, id);
  switch (e?.kind) {
    case 'wall':
      return wallInfo(p, e.obj);
    case 'space':
      return spaceInfo(p, e.obj);
    case 'opening':
      return openingInfo(p, e.wall!, e.obj);
    case 'furniture':
      return { ...e.obj, type: 'furniture' as const, label: p.library.furniture[e.obj.type]?.name };
    case 'element':
      return { ...e.obj, type: 'element' as const };
    case 'level':
      return { ...e.obj, type: 'level' as const, gross: r2(grossArea(p, e.id)) };
    case 'constraint':
      return { ...e.obj, type: 'constraint' as const };
    default:
      return null;
  }
}

/** What get_object returns */
export type ObjectInfo = NonNullable<ReturnType<typeof objectInfo>>;
