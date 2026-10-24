/** Shapes the plan draws: derived from project data, cached per floor. */
import {
  add,
  derived,
  difference,
  furnitureFootprint,
  furniturePlan,
  projectElements,
  ringArea,
  scale,
  union,
  wallBody,
  wallDir,
  wallNormal,
  pointAt,
  type ElementPlan,
  type Furniture,
  type Opening,
  type Point,
  type Polygon,
  type Project,
  type Space,
  type Wall,
} from '@plinth/core';
import polylabel from 'polylabel';

export interface OpeningShape {
  id: string;
  wallId: string;
  kind: Opening['kind'];
  glassBlock: boolean;
  /** Opening outline (hit area) */
  outline: Point[];
  /** Lines (door leaves, window lines) */
  lines: Point[][];
  /** Door swing arc SVG path */
  arcs: string[];
  dashed: boolean;
}

export interface LevelShapes {
  bounds: [number, number, number, number];
  spaces: { s: Space; d: string; label: Point; area: number }[];
  /** Merged solids of load-bearing walls and partitions (openings cut out) */
  solid: string;
  bearing: string;
  light: string;
  railings: { w: Wall; d: string }[];
  walls: { w: Wall; d: string }[];
  openings: OpeningShape[];
  /** Each piece's footprint and, when it has a look, its plan symbol: outlines seen from above (lowest first) and lines */
  furniture: { f: Furniture; d: string; symbol?: { items: { d: string; fill: boolean }[]; lines: string } }[];
  /** Elements (stairs, ponds, drains) drawn on this level, including stairs seen from the level they arrive at */
  elements: ElementPlan[];
}

/** Margin the plan leaves around a level's drawing, in millimetres (3D starts from the same framing) */
export const PLAN_PAD = 1500;

/** Whether this is the lowest floor, the one standing on the site's plinth */
export const isGroundLevel = (p: Project, level: string) => p.levels.find(l => l.id === level)?.elevation === Math.min(...p.levels.map(l => l.elevation));

/**
 * The white board the house stands on, like a model's base: the site's bounding rectangle with a margin of 8% of its longer side,
 * between 1.5 and 4 m. Drawn on the lowest floor of the plan and as the 3D plinth.
 */
export function plinthRect(p: Project): [number, number, number, number] {
  const xs = p.site.boundary.map(q => q[0]),
    ys = p.site.boundary.map(q => q[1]);
  const [x0, y0, x1, y1] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const m = Math.min(4000, Math.max(1500, 0.08 * Math.max(x1 - x0, y1 - y0)));
  return [x0 - m, y0 - m, x1 + m, y1 + m];
}

/** What the plan shows of a level, in millimetres: its drawing (and on the lowest floor the plinth) plus a margin */
export function planFrame(p: Project, level: string) {
  let [x0, y0, x1, y1] = levelShapes(p, level).bounds;
  if (isGroundLevel(p, level)) {
    const [a, b, c, d] = plinthRect(p);
    [x0, y0, x1, y1] = [Math.min(x0, a), Math.min(y0, b), Math.max(x1, c), Math.max(y1, d)];
  }
  return { x: x0 - PLAN_PAD, y: y0 - PLAN_PAD, w: x1 - x0 + 2 * PLAN_PAD, h: y1 - y0 + 2 * PLAN_PAD };
}

export const polyPath = (polys: Polygon[]) =>
  polys.map(p => [p.outer, ...(p.holes ?? [])].map(r => `M${r.map(([x, y]) => `${x},${y}`).join('L')}Z`).join('')).join('');

function rectAlong(w: Wall, a: number, b: number, half: number): Point[] {
  const n = wallNormal(w);
  const p1 = pointAt(w, a),
    p2 = pointAt(w, b);
  return [add(p1, scale(n, half)), add(p2, scale(n, half)), add(p2, scale(n, -half)), add(p1, scale(n, -half))];
}

function openingShape(w: Wall, o: Opening): OpeningShape {
  const half = w.thickness / 2,
    a = o.at - o.width / 2,
    b = o.at + o.width / 2;
  const d = wallDir(w),
    n = wallNormal(w);
  const lines: Point[][] = [],
    arcs: string[] = [];
  const at = (t: number, off: number) => add(pointAt(w, t), scale(n, off));
  if (o.kind === 'window') {
    for (const off of [-half, 0, half]) lines.push([at(a, off), at(b, off)]);
    lines.push([at(a, -half), at(a, half)], [at(b, -half), at(b, half)]);
  } else if (o.kind === 'sliding-door') {
    const m = (a + b) / 2;
    lines.push([at(a, -half / 3), at(m + 50, -half / 3)], [at(m - 50, half / 3), at(b, half / 3)]);
    lines.push([at(a, -half), at(a, half)], [at(b, -half), at(b, half)]);
  } else if (o.kind === 'door' || o.kind === 'gate') {
    const leaves: { hinge: number; dir: 1 | -1; len: number }[] =
      o.kind === 'gate'
        ? [
            { hinge: a, dir: 1, len: o.width / 2 },
            { hinge: b, dir: -1, len: o.width / 2 },
          ]
        : [{ hinge: o.swing?.hinge === 'end' ? b : a, dir: o.swing?.hinge === 'end' ? -1 : 1, len: o.width }];
    const side = o.swing?.side === 'left' ? -1 : 1;
    for (const l of leaves) {
      const h = at(l.hinge, side * half);
      const open = add(h, scale(n, side * l.len));
      const closed = add(h, scale(d, l.dir * l.len));
      lines.push([h, open]);
      // Arc: sweep from the open leaf position to the closed one
      const sweep = side * l.dir > 0 ? 0 : 1;
      arcs.push(`M${open[0]},${open[1]}A${l.len},${l.len} 0 0 ${sweep} ${closed[0]},${closed[1]}`);
    }
  } else {
    lines.push([at(a, -half), at(b, -half)], [at(a, half), at(b, half)]);
  }
  return {
    id: o.id,
    wallId: w.id,
    kind: o.kind,
    glassBlock: o.glazing === 'glass-block',
    outline: rectAlong(w, a, b, half + 10),
    lines,
    arcs,
    dashed: o.kind === 'opening',
  };
}

/** Element drawings on a level; a stair seen from above is left out where this level's own stair covers it (the plan shows one) */
function levelElements(p: Project, level: string) {
  const plans = projectElements(p)
    .flatMap(g => g.plans)
    .filter(e => e.level === level);
  const box = (e: ElementPlan) => {
    const q = e.fills.flatMap(f => f.ring);
    return [Math.min(...q.map(v => v[0])), Math.min(...q.map(v => v[1])), Math.max(...q.map(v => v[0])), Math.max(...q.map(v => v[1]))];
  };
  const own = plans.filter(e => !e.faint).map(box);
  return plans.filter(
    e =>
      !e.faint ||
      !own.some(b => {
        const a = box(e);
        return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
      }),
  );
}

const cache = new WeakMap<Project, Map<string, LevelShapes>>();

export function levelShapes(p: Project, level: string): LevelShapes {
  let m = cache.get(p);
  if (!m) cache.set(p, (m = new Map()));
  const hit = m.get(level);
  if (hit) return hit;

  const walls = p.walls.filter(w => w.level === level);
  const holes = walls.flatMap(w => w.openings.map(o => ({ outer: rectAlong(w, o.at - o.width / 2, o.at + o.width / 2, w.thickness / 2 + 2) })));
  const solidWalls = walls.filter(w => w.kind === 'bearing' || w.kind === 'partition');
  const bearing = difference(union(solidWalls.filter(w => w.kind === 'bearing').map(wallBody)), holes);
  const partition = difference(union(solidWalls.filter(w => w.kind === 'partition').map(wallBody)), [...holes, ...bearing]);
  const light = difference(union(walls.filter(w => w.kind === 'fence' || w.kind === 'parapet').map(wallBody)), holes);

  const net = new Map(derived(p).areas.levels.flatMap(l => l.spaces.map(s => [s.id, s.net])));
  const spaces = p.spaces
    .filter(s => s.level === level)
    .map(s => {
      const big = [...s.shape].sort((a, b) => ringArea(b.outer) - ringArea(a.outer))[0];
      const lp = polylabel([big.outer, ...(big.holes ?? [])], 50);
      return { s, d: polyPath(s.shape), label: [lp[0], lp[1]] as Point, area: net.get(s.id) ?? 0 };
    });

  const pts = [...walls.flatMap(w => [w.start, w.end]), ...p.spaces.filter(s => s.level === level).flatMap(s => s.shape.flatMap(q => q.outer))];
  const src = pts.length ? pts : p.site.boundary;
  const xs = src.map(q => q[0]),
    ys = src.map(q => q[1]);
  const shapes: LevelShapes = {
    bounds: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    spaces,
    solid: polyPath(partition),
    bearing: polyPath(bearing),
    light: polyPath(light),
    railings: walls.filter(w => w.kind === 'railing').map(w => ({ w, d: polyPath([wallBody(w)]) })),
    walls: walls.map(w => ({ w, d: polyPath([wallBody(w)]) })),
    openings: walls.flatMap(w => w.openings.map(o => openingShape(w, o))),
    furniture: p.furniture
      .filter(f => f.level === level)
      .map(f => {
        const sym = furniturePlan(p, f);
        return {
          f,
          d: polyPath([furnitureFootprint(f)]),
          symbol: sym
            ? {
                items: sym.items.map(it => ({ d: polyPath([{ outer: it.ring }]), fill: it.fill })),
                lines: sym.lines.map(l => `M${l.map(q => q.join(' ')).join('L')}`).join(''),
              }
            : undefined,
        };
      }),
    elements: levelElements(p, level),
  };
  m.set(level, shapes);
  return shapes;
}
