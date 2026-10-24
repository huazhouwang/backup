/**
 * Vertical coordination and structure, as BIM tools treat them. A stair needs an opening in the slab it climbs through (Revit's
 * stair and shaft opening): without one it runs into the floor above, an error. Openings in a slab should be guarded by walls or
 * railings. And the architectural model keeps structure plausible without computing it (that is the engineers' analytical model):
 * an upper bearing wall should stand on a bearing wall, and a floor shouldn't reach far beyond the storey below it. Those two
 * are rules of thumb, reported as warnings, never as engineering.
 */
import pc from 'polygon-clipping';
import { area, dot, fromPc, rect, sub, toPc, union, wallBody, wallDir, wallLength, wallNormal } from '../geometry/geometry.js';
import { projectElements } from '../geometry/elements.js';
import { overlapArea } from '../geometry/topology.js';
import { text } from '../i18n.js';
import { levelStack } from '../model/levels.js';
import type { Id, Polygon, Project, Space, Wall } from '../model/schema.js';
import type { Issue } from './rules.js';

/** Share of a stair's footprint the opening above must cover: the top step may tuck under the landing's edge */
const STAIR_COVER = 0.6;
/** Share of a slab opening's edge that walls or railings should guard: one side stays open where the stair arrives */
const GUARDED = 0.5;
/** How far a wall may sit from an opening's edge and still guard it (mm) */
const EDGE_NEAR = 200;
/** How far an upper bearing wall may be offset from the one below and still stand on it (mm) */
const BEARING_OFFSET = 150;
/** Share of an upper bearing wall's length that should stand on a bearing wall below */
const BEARING_SUPPORTED = 0.8;
/** How far a floor may reach beyond the storey below before it is flagged (mm): a usual balcony is 1.2–1.5 m */
const CANTILEVER = 1800;

const isOpening = (s: Space) => s.kind === 'void' || !!s.slabOpening;
const hasSlab = (s: Space) => !isOpening(s);

/** The level directly below one, in the stack */
function levelBelow(p: Project, id: Id) {
  const stack = levelStack(p);
  const i = stack.findIndex(l => l.id === id);
  return i > 0 ? stack[i - 1] : undefined;
}

/** How much of a ring's perimeter walls on its level run along (mm guarded, mm in all) */
function guardedEdge(p: Project, level: Id, ring: [number, number][]) {
  const walls = p.walls.filter(w => w.level === level);
  let total = 0,
    guarded = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1) continue;
    total += len;
    // Walls parallel to this edge and near it: the stretch of the edge they cover
    const d: [number, number] = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const cover: [number, number][] = [];
    for (const w of walls) {
      if (Math.abs(dot(wallDir(w), d)) < 0.99) continue;
      const off = Math.abs(dot(sub(w.start, a), [-d[1], d[0]]));
      if (off > EDGE_NEAR + w.thickness / 2) continue;
      const s = dot(sub(w.start, a), d),
        e = dot(sub(w.end, a), d);
      const lo = Math.max(0, Math.min(s, e)),
        hi = Math.min(len, Math.max(s, e));
      if (hi > lo) cover.push([lo, hi]);
    }
    cover.sort((x, y) => x[0] - y[0]);
    let reach = 0;
    for (const [lo, hi] of cover) {
      if (hi <= reach) continue;
      guarded += hi - Math.max(lo, reach);
      reach = hi;
    }
  }
  return { guarded, total };
}

/** How much of a wall's length stands on bearing walls of the level below (mm) */
function supportedLength(w: Wall, below: Wall[]) {
  const d = wallDir(w),
    n = wallNormal(w),
    L = wallLength(w);
  const spans: [number, number][] = [];
  for (const b of below) {
    if (Math.abs(dot(wallDir(b), d)) < 0.99 || Math.abs(dot(sub(b.start, w.start), n)) > BEARING_OFFSET) continue;
    const s = dot(sub(b.start, w.start), d),
      e = dot(sub(b.end, w.start), d);
    const lo = Math.max(0, Math.min(s, e)),
      hi = Math.min(L, Math.max(s, e));
    if (hi > lo) spans.push([lo, hi]);
  }
  spans.sort((x, y) => x[0] - y[0]);
  let reach = 0,
    sum = 0;
  for (const [lo, hi] of spans) {
    if (hi <= reach) continue;
    sum += hi - Math.max(lo, reach);
    reach = hi;
  }
  return sum;
}

/** A polygon's typical depth: twice its area over its perimeter (a strip's width, a square's half side) */
function depthOf(poly: Polygon) {
  const r = poly.outer;
  let per = 0;
  for (let i = 0; i < r.length; i++) per += Math.hypot(r[(i + 1) % r.length][0] - r[i][0], r[(i + 1) % r.length][1] - r[i][1]);
  return per > 0 ? (2 * area([poly])) / per : 0;
}

export function checkStructure(p: Project): Issue[] {
  const out: Issue[] = [];
  const name = new Map(p.levels.map(l => [l.id, l.name]));

  // A stair climbs through an opening in the slab of the level it reaches
  const solids = projectElements(p).flatMap(g => g.solids);
  for (const e of p.elements) {
    if (!e.topLevel) continue;
    const own = solids.filter(s => s.id === e.id && s.level === e.level);
    if (!own.length) continue;
    const xs = own.flatMap(s => s.outline.map(q => q[0])),
      ys = own.flatMap(s => s.outline.map(q => q[1]));
    const foot = [rect(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys))];
    const openings = p.spaces.filter(s => s.level === e.topLevel && isOpening(s)).flatMap(s => s.shape);
    if (overlapArea(foot, openings) < STAIR_COVER * area(foot))
      out.push({
        code: 'stair-no-opening',
        severity: 'error',
        message: text('rule_stair_no_opening', '{element} has no opening in the floor of {level} to climb through', {
          element: e.name,
          level: name.get(e.topLevel) ?? e.topLevel,
        }),
        targets: [e.id],
      });
  }

  // Openings in a slab are guarded by walls or railings, except where the stair arrives
  for (const s of p.spaces.filter(isOpening)) {
    const edge = s.shape.reduce(
      (acc, poly) => {
        const g = guardedEdge(p, s.level, poly.outer);
        return { guarded: acc.guarded + g.guarded, total: acc.total + g.total };
      },
      { guarded: 0, total: 0 },
    );
    if (edge.total > 0 && edge.guarded < GUARDED * edge.total)
      out.push({
        code: 'opening-unguarded',
        severity: 'warning',
        message: text('rule_opening_unguarded', '{space} is an opening in the floor with little wall or railing around it', { space: s.name }),
        targets: [s.id],
      });
  }

  // Upper bearing walls stand on bearing walls below
  for (const w of p.walls.filter(x => x.kind === 'bearing')) {
    const below = levelBelow(p, w.level);
    if (!below) continue;
    const bearers = p.walls.filter(x => x.level === below.id && x.kind === 'bearing');
    if (supportedLength(w, bearers) < BEARING_SUPPORTED * wallLength(w))
      out.push({
        code: 'bearing-unsupported',
        severity: 'warning',
        message: text('rule_bearing_unsupported', '{wall} is a bearing wall with no bearing wall under most of it on {level}', {
          wall: w.name,
          level: below.name,
        }),
        targets: [w.id],
      });
  }

  // A floor shouldn't reach far beyond the storey below: its walls and floors
  for (const lv of levelStack(p)) {
    const below = levelBelow(p, lv.id);
    if (!below) continue;
    const base = union([
      ...p.spaces.filter(s => s.level === below.id && s.kind !== 'outdoor').flatMap(s => s.shape),
      ...p.walls.filter(w => w.level === below.id && (w.kind === 'bearing' || w.kind === 'partition')).map(wallBody),
    ]);
    for (const s of p.spaces.filter(x => x.level === lv.id && hasSlab(x) && x.kind !== 'outdoor')) {
      const beyond = base.length ? fromPc(pc.difference(s.shape.map(toPc), ...base.map(q => [toPc(q)]))) : s.shape;
      const deepest = Math.max(0, ...beyond.map(depthOf));
      if (deepest > CANTILEVER)
        out.push({
          code: 'cantilever',
          severity: 'warning',
          message: text('rule_cantilever', '{space} reaches about {depth} m beyond the storey below: check how it is supported', {
            space: s.name,
            depth: (deepest / 1000).toFixed(1),
          }),
          targets: [s.id],
        });
    }
  }

  return out;
}
