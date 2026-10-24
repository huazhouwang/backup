/**
 * Geometry of elements (stairs, ponds, drains), derived from their parameters like wall boxes are (see mesh.ts): plan linework
 * for the plan view, solids for the 3D view and glTF export. Coordinates in millimetres; z from the element level's floor.
 */
import type { Element, Level, Point, Project } from '../model/schema.js';

/** A prism: a plan outline extruded from z up by height */
export interface Solid {
  /** Owning element */
  id: string;
  level: string;
  /** What it is, for the renderer's color: structure (stairs, rims), water, grate */
  kind: 'structure' | 'water' | 'grate';
  outline: Point[];
  z: number;
  height: number;
}

/** What an element draws on one level's plan */
export interface ElementPlan {
  id: string;
  level: string;
  /** Filled areas (stair flights and landings, water) */
  fills: { ring: Point[]; kind: 'structure' | 'water' }[];
  /** Linework (treads, walking line, arrow, grate bars) */
  lines: { points: Point[]; dashed?: boolean }[];
  /** Drawn faintly: seen through the floor opening from the level above */
  faint?: boolean;
}

export interface ElementGeometry {
  solids: Solid[];
  plans: ElementPlan[];
}

/** Rectangle [x, y, w, h] (top-left corner, size) */
type Rect = [number, number, number, number];

const isRect = (v: unknown): v is Rect => Array.isArray(v) && v.length === 4 && v.every(n => typeof n === 'number');
const rectRing = ([x, y, w, h]: Rect): Point[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

/**
 * A U-shaped stair from one level to the next: two flights side by side and a landing at the far end.
 * - `rect` [x, y, w, h]: the plan area the flights and landing fit in
 * - `up` 'north' | 'south' | 'east' | 'west': the direction the first flight climbs
 * - `turn` 'left' | 'right': which way it turns at the landing (the first flight is on the other side)
 * - `gap` (mm, default 100): the gap between the flights; `riser` (default 175) the largest step height; `tread` (default 280)
 *   the deepest tread
 */
export interface StairParams {
  rect: Rect;
  up: 'north' | 'south' | 'east' | 'west';
  turn: 'left' | 'right';
  gap?: number;
  riser?: number;
  tread?: number;
}

const DIRS: Record<StairParams['up'], Point> = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
/** Thickness of a step's slab below its tread, and of the landing */
const WAIST = 150;
/** Plan arrows and the walking line stop this far short of the ends */
const ARROW = 200;

/** Height between a level and the level its stair arrives at */
function storeyHeight(p: Project, e: Element) {
  const from = p.levels.find(l => l.id === e.level);
  const to = e.topLevel ? p.levels.find(l => l.id === e.topLevel) : nextLevel(p.levels, from);
  if (!from || !to) return null;
  return { from, to, height: to.elevation - from.elevation };
}

const nextLevel = (levels: Level[], l: Level | undefined) => l && [...levels].sort((a, b) => a.elevation - b.elevation).find(x => x.elevation > l.elevation);

function stair(p: Project, e: Element): ElementGeometry {
  const s = e.params as unknown as StairParams;
  const storey = storeyHeight(p, e);
  if (!isRect(s.rect) || !DIRS[s.up] || !storey || storey.height <= 0) return fallback(e);
  const [x, y, w, h] = s.rect;
  const a = DIRS[s.up];
  // Across, toward the side it turns to (x east, y south: right of travel (dx, dy) is (-dy, dx))
  const c: Point = s.turn === 'left' ? [a[1], -a[0]] : [-a[1], a[0]];
  const along = a[0] ? w : h,
    across = a[0] ? h : w;
  // Origin: the start end's corner on the first flight's side
  const mid: Point = [x + w / 2, y + h / 2];
  const o: Point = [mid[0] - (a[0] * along) / 2 - (c[0] * across) / 2, mid[1] - (a[1] * along) / 2 - (c[1] * across) / 2];
  const at = (u: number, v: number): Point => [o[0] + a[0] * u + c[0] * v, o[1] + a[1] * u + c[1] * v];
  const quad = (u0: number, u1: number, v0: number, v1: number) => [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)];

  const gap = s.gap ?? 100;
  const fw = (across - gap) / 2;
  const edge = along - fw; // where the landing starts
  const n = Math.ceil(storey.height / (s.riser ?? 175));
  const r = storey.height / n;
  const n1 = Math.ceil(n / 2),
    n2 = n - n1;
  const t = Math.min(s.tread ?? 280, edge / Math.max(1, n1 - 1));

  const solids: Solid[] = [];
  const add = (ring: Point[], top: number) =>
    solids.push({ id: e.id, level: e.level, kind: 'structure', outline: ring, z: Math.max(0, top - r - WAIST), height: top - Math.max(0, top - r - WAIST) });
  // First flight, climbing toward the landing; its last riser steps onto the landing
  for (let k = 1; k < n1; k++) add(quad(edge - (n1 - k) * t, edge - (n1 - k - 1) * t, 0, fw), k * r);
  add(quad(edge, along, 0, across), n1 * r);
  // Second flight, back toward the start end; its last riser steps onto the upper floor
  for (let j = 1; j < n2; j++) add(quad(edge - j * t, edge - (j - 1) * t, across - fw, across), (n1 + j) * r);

  const start1 = edge - (n1 - 1) * t,
    end2 = edge - (n2 - 1) * t;
  const treads: ElementPlan['lines'] = [];
  for (let k = 0; k < n1; k++) treads.push({ points: [at(start1 + k * t, 0), at(start1 + k * t, fw)] });
  for (let j = 0; j < n2; j++) treads.push({ points: [at(end2 + j * t, across - fw), at(end2 + j * t, across)] });
  const fills: ElementPlan['fills'] = [
    { ring: quad(start1, edge, 0, fw), kind: 'structure' },
    { ring: quad(edge, along, 0, across), kind: 'structure' },
    { ring: quad(end2, edge, across - fw, across), kind: 'structure' },
  ];
  // Walking line up the first flight, around the landing and down the second, with an arrow at its end
  const v1 = fw / 2,
    v2 = across - fw / 2,
    turnAt = edge + fw / 2;
  const tip = at(end2 + ARROW / 2, v2);
  const back: Point = [-a[0], -a[1]];
  const side: Point = [c[0], c[1]];
  const arrow = [
    [tip[0] - back[0] * ARROW + (side[0] * ARROW) / 2, tip[1] - back[1] * ARROW + (side[1] * ARROW) / 2],
    tip,
    [tip[0] - back[0] * ARROW - (side[0] * ARROW) / 2, tip[1] - back[1] * ARROW - (side[1] * ARROW) / 2],
  ] as Point[];
  const walk = [at(start1 + ARROW / 2, v1), at(turnAt, v1), at(turnAt, v2), tip];
  const base: ElementPlan = { id: e.id, level: e.level, fills, lines: [...treads, { points: walk }, { points: arrow }] };
  // From the level above, the flights are seen through the floor opening
  const above: ElementPlan = { id: e.id, level: storey.to.id, fills, lines: treads.map(l => ({ ...l, dashed: true })), faint: true };
  return { solids, plans: [base, above] };
}

/** Points along a circular arc from angle a0 to a1 (radians, x east, y south) */
const arc = ([cx, cy]: Point, radius: number, a0: number, a1: number, steps = 24): Point[] =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const t = a0 + (a1 - a0) * (i / steps);
    return [cx + radius * Math.cos(t), cy + radius * Math.sin(t)] as Point;
  });

/** Start and end angles of a pond's sweep; north is -y */
const SWEEPS: Record<string, [number, number]> = {
  full: [0, 2 * Math.PI],
  'quarter-ne': [-Math.PI / 2, 0],
  'quarter-nw': [-Math.PI, -Math.PI / 2],
  'quarter-se': [0, Math.PI / 2],
  'quarter-sw': [Math.PI / 2, Math.PI],
};
const RIM = { width: 120, height: 150 };

/** Outdoor grade (the top of outdoor ground slabs, see Model3D) relative to a ground-floor element's level */
const grade = (p: Project, e: Element) => {
  const l = p.levels.find(x => x.id === e.level);
  return l && l.elevation === 0 ? p.site.groundLevel + 20 : 0;
};

/** A pond: water inside a low rim. `center`, `radius`, `sweep` ('full' or a quarter such as 'quarter-ne') */
function pond(p: Project, e: Element): ElementGeometry {
  const { center, radius, sweep = 'full' } = e.params as { center?: Point; radius?: number; sweep?: string };
  const angles = SWEEPS[sweep];
  if (!Array.isArray(center) || typeof radius !== 'number' || !angles) return fallback(e);
  const full = sweep === 'full';
  const outer = arc(center, radius, ...angles);
  const inner = arc(center, radius - RIM.width, ...angles);
  const water = full ? inner : [center, ...inner];
  const z = grade(p, e);
  // The rim: the band between the two arcs, plus the straight edges of a quarter
  const rim: Point[][] = full ? outer.slice(0, -1).map((q, i) => [q, outer[i + 1], inner[i + 1], inner[i]]) : [[...outer, ...[...inner].reverse()]];
  return {
    solids: [
      ...rim.map(ring => ({ id: e.id, level: e.level, kind: 'structure' as const, outline: ring, z, height: RIM.height })),
      { id: e.id, level: e.level, kind: 'water', outline: water, z, height: RIM.height / 3 },
    ],
    plans: [
      {
        id: e.id,
        level: e.level,
        fills: [
          { ring: full ? outer : [center, ...outer], kind: 'structure' },
          { ring: water, kind: 'water' },
        ],
        lines: [],
      },
    ],
  };
}

/** A drain channel with a grate: `rect` [x, y, w, h] */
function drain(p: Project, e: Element): ElementGeometry {
  const rect = (e.params as { rect?: unknown }).rect;
  if (!isRect(rect)) return fallback(e);
  const [x, y, w, h] = rect;
  const ring = rectRing(rect);
  // Bars across the channel every 50 mm
  const bars: ElementPlan['lines'] = [];
  const long = w >= h,
    len = long ? w : h;
  for (let d = 50; d < len; d += 50)
    bars.push({
      points: long
        ? [
            [x + d, y],
            [x + d, y + h],
          ]
        : [
            [x, y + d],
            [x + w, y + d],
          ],
    });
  return {
    solids: [{ id: e.id, level: e.level, kind: 'grate', outline: ring, z: grade(p, e), height: 10 }],
    plans: [{ id: e.id, level: e.level, fills: [{ ring, kind: 'structure' }], lines: bars }],
  };
}

/** Types without their own geometry show their `rect` or `footprint` as a box, so nothing disappears without a trace */
function fallback(e: Element): ElementGeometry {
  const { rect, footprint } = e.params as { rect?: unknown; footprint?: { x: number; y: number; w: number; h: number } };
  const r: Rect | null = isRect(rect) ? rect : footprint ? [footprint.x, footprint.y, footprint.w, footprint.h] : null;
  if (!r) return { solids: [], plans: [] };
  const ring = rectRing(r);
  return {
    solids: [{ id: e.id, level: e.level, kind: 'structure', outline: ring, z: 0, height: 100 }],
    plans: [{ id: e.id, level: e.level, fills: [{ ring, kind: 'structure' }], lines: [{ points: [ring[0], ring[2]] }, { points: [ring[1], ring[3]] }] }],
  };
}

const GEOMETRY: Record<string, (p: Project, e: Element) => ElementGeometry> = { stair, pond, drain };

export function elementGeometry(p: Project, e: Element): ElementGeometry {
  return (GEOMETRY[e.type] ?? ((_, x) => fallback(x)))(p, e);
}

export const projectElements = (p: Project) => p.elements.map(e => elementGeometry(p, e));
