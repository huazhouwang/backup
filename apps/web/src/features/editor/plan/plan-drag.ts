/**
 * Dragging in the plan: turns a pointer movement (in millimetres) on the selected wall, door or window, or piece of furniture into
 * the capability call that makes it, with snapping. The plan previews that call on a scratch copy and runs it on release, so a
 * drag is one undoable edit, the same one the agent or the props panel would make.
 *
 * Snapping, within a few screen pixels: a wall to the line of a parallel wall (on its floor, or the floors above and below), a
 * door or window to the middle of its wall, furniture against a wall face; walls and furniture to the snap points widgets give
 * (a grid's intersections). Otherwise to a 50 mm step.
 */
import {
  directionOf,
  dot,
  findObject,
  furnitureFootprint,
  parallel,
  pointAt,
  wallDir,
  wallLength,
  wallNormal,
  type Point,
  type Project,
  type Wall,
} from '@opensu/core';

export interface DragResult {
  name: string;
  input: Record<string, unknown>;
  /** Lines to draw while snapped, to show what it snapped to */
  guides: [Point, Point][];
  /** Distance moved, or what it measures, shown next to the pointer */
  readout: string | null;
}

/** Objects that can be dragged */
export const draggable = (p: Project, id: string) => {
  const e = findObject(p, id);
  return e?.kind === 'wall' || e?.kind === 'opening' || e?.kind === 'furniture';
};

const STEP = 50;
const snapStep = (v: number) => Math.round(v / STEP) * STEP;
const UNIT: Record<'north' | 'south' | 'east' | 'west', Point> = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
const metres = (mm: number) => `${(mm / 1000).toFixed(2)} m`;

/**
 * The call for moving `id` by `delta` (mm). `tol` is the snapping distance in mm (a few screen pixels at the current zoom);
 * `snaps` are the widgets' snap points on its level. Null when it hasn't moved.
 */
export function dragCall(p: Project, id: string, delta: Point, tol: number, snaps: Point[] = []): DragResult | null {
  const e = findObject(p, id);
  if (e?.kind === 'wall') return dragWall(p, e.obj, delta, tol, snaps);
  if (e?.kind === 'opening' && e.wall) return dragOpening(e.wall, e.obj.id, delta, tol);
  if (e?.kind === 'furniture') return dragFurniture(p, e.obj, delta, tol, snaps);
  return null;
}

/** Levels next to this one (walls usually line up across floors) */
function nearLevels(p: Project, level: string) {
  const sorted = [...p.levels].sort((a, b) => a.elevation - b.elevation);
  const i = sorted.findIndex(l => l.id === level);
  return new Set([sorted[i - 1]?.id, level, sorted[i + 1]?.id].filter(Boolean));
}

function dragWall(p: Project, w: Wall, delta: Point, tol: number, snaps: Point[]): DragResult | null {
  const n = wallNormal(w),
    d = wallDir(w);
  const c0 = dot(w.start, n);
  const want = c0 + dot(delta, n);
  // The nearest line of a parallel wall, if close enough
  const levels = nearLevels(p, w.level);
  let best: { c: number; o: Wall } | null = null;
  for (const o of p.walls) {
    if (o.id === w.id || !levels.has(o.level) || !parallel(o, w)) continue;
    const c = dot(o.start, n);
    if (Math.abs(c - want) < tol && (!best || Math.abs(c - want) < Math.abs(best.c - want))) best = { c, o };
  }
  // A snap point on its centreline: the nearest one, unless a parallel wall's line is nearer
  let onSnap: number | null = null;
  for (const s of snaps) {
    const c = dot(s, n);
    if (
      Math.abs(c - want) < tol &&
      (onSnap === null || Math.abs(c - want) < Math.abs(onSnap - want)) &&
      (!best || Math.abs(c - want) < Math.abs(best.c - want))
    )
      onSnap = c;
  }
  const k = onSnap !== null ? onSnap - c0 : best ? best.c - c0 : snapStep(want - c0);
  if (Math.abs(k) < 1) return null;
  // wall_move takes a compass direction: the one nearest the normal, with the distance that projects onto the normal as k
  const dir = directionOf([n[0] * Math.sign(k), n[1] * Math.sign(k)]);
  const distance = Math.abs(k) / Math.abs(dot(UNIT[dir], n));
  const guides: [Point, Point][] = [];
  if (best && onSnap === null) {
    // Along the shared line, spanning both walls
    const along = [w.start, w.end, best.o.start, best.o.end].map(q => dot(q, d));
    const a = Math.min(...along),
      b = Math.max(...along);
    const at = (s: number): Point => [d[0] * s + n[0] * best!.c, d[1] * s + n[1] * best!.c];
    guides.push([at(a), at(b)]);
  }
  return { name: 'wall_move', input: { wall: w.id, direction: dir, distance: Math.round(distance) }, guides, readout: metres(Math.abs(k)) };
}

function dragOpening(w: Wall, id: string, delta: Point, tol: number): DragResult | null {
  const o = w.openings.find(x => x.id === id)!;
  const L = wallLength(w);
  const want = o.at + dot(delta, wallDir(w));
  const centred = Math.abs(want - L / 2) < tol;
  const at = Math.min(L - o.width / 2, Math.max(o.width / 2, centred ? L / 2 : snapStep(want)));
  if (Math.abs(at - o.at) < 1) return null;
  const n = wallNormal(w),
    mid = pointAt(w, L / 2),
    h = w.thickness;
  const guides: [Point, Point][] = centred
    ? [
        [
          [mid[0] - n[0] * h, mid[1] - n[1] * h],
          [mid[0] + n[0] * h, mid[1] + n[1] * h],
        ],
      ]
    : [];
  // Clear distances from the wall ends to the opening's edges
  return {
    name: 'opening_update',
    input: { opening: id, at: Math.round(at) },
    guides,
    readout: `${metres(at - o.width / 2)} · ${metres(L - at - o.width / 2)}`,
  };
}

function dragFurniture(p: Project, f: Project['furniture'][number], delta: Point, tol: number, snaps: Point[]): DragResult | null {
  let pos: Point = [f.position[0] + delta[0], f.position[1] + delta[1]];
  const box = (q: Point) => {
    const r = furnitureFootprint({ ...f, position: q }).outer;
    return [Math.min(...r.map(v => v[0])), Math.min(...r.map(v => v[1])), Math.max(...r.map(v => v[0])), Math.max(...r.map(v => v[1]))];
  };
  const guides: [Point, Point][] = [];
  const snapped = [false, false];
  const [x0, y0, x1, y1] = box(pos);
  // Against a wall face: for each axis, the nearest face of an axis-aligned wall beside the furniture
  for (const w of p.walls.filter(x => x.level === f.level && (x.kind === 'bearing' || x.kind === 'partition'))) {
    const vertical = Math.abs(w.start[0] - w.end[0]) < 1,
      horizontal = Math.abs(w.start[1] - w.end[1]) < 1;
    if (!vertical && !horizontal) continue;
    const ax = vertical ? 0 : 1;
    if (snapped[ax]) continue;
    const c = w.start[ax],
      half = w.thickness / 2;
    // The wall must run alongside the furniture
    const lo = Math.min(w.start[1 - ax], w.end[1 - ax]),
      hi = Math.max(w.start[1 - ax], w.end[1 - ax]);
    const [a0, a1] = ax === 0 ? [y0, y1] : [x0, x1];
    if (a1 < lo || a0 > hi) continue;
    const [s0, s1] = ax === 0 ? [x0, x1] : [y0, y1];
    const shift = [c + half - s0, c - half - s1].find(s => Math.abs(s) < tol);
    if (shift == null) continue;
    pos = ax === 0 ? [pos[0] + shift, pos[1]] : [pos[0], pos[1] + shift];
    snapped[ax] = true;
    const face = Math.abs(c + half - s0) < Math.abs(c - half - s1) ? c + half : c - half;
    guides.push(
      ax === 0
        ? [
            [face, lo],
            [face, hi],
          ]
        : [
            [lo, face],
            [hi, face],
          ],
    );
  }
  // Its edges or middle on a snap point's line, per axis (a grid's axes)
  for (const ax of [0, 1]) {
    if (snapped[ax]) continue;
    const [b0, b1] = ax === 0 ? [x0, x1] : [y0, y1];
    let shift: number | null = null;
    for (const s of snaps)
      for (const d of [s[ax] - b0, s[ax] - b1, s[ax] - (b0 + b1) / 2]) if (Math.abs(d) < tol && (shift === null || Math.abs(d) < Math.abs(shift))) shift = d;
    if (shift === null) continue;
    pos = ax === 0 ? [pos[0] + shift, pos[1]] : [pos[0], pos[1] + shift];
    snapped[ax] = true;
  }
  pos = [snapped[0] ? pos[0] : f.position[0] + snapStep(pos[0] - f.position[0]), snapped[1] ? pos[1] : f.position[1] + snapStep(pos[1] - f.position[1])];
  if (Math.abs(pos[0] - f.position[0]) < 1 && Math.abs(pos[1] - f.position[1]) < 1) return null;
  return { name: 'furniture_move', input: { furniture: f.id, position: [Math.round(pos[0]), Math.round(pos[1])] }, guides, readout: null };
}

/** Rotation steps for furniture turned with its handle (degrees) */
const TURN_STEP = 15;

/**
 * Turning a piece of furniture with its handle (which stands off its back edge, the side its depth faces away from): the
 * rotation that points the handle at the pointer, in 15° steps
 */
export function rotateCall(p: Project, id: string, at: Point): DragResult | null {
  const f = p.furniture.find(x => x.id === id);
  if (!f) return null;
  const v = [at[0] - f.position[0], at[1] - f.position[1]];
  if (Math.hypot(v[0], v[1]) < 1) return null;
  // The back edge's outward direction at rotation r is (sin r, -cos r): r = atan2(vx, -vy)
  const deg = (Math.atan2(v[0], -v[1]) * 180) / Math.PI;
  const rotation = (((Math.round(deg / TURN_STEP) * TURN_STEP) % 360) + 360) % 360;
  return { name: 'furniture_move', input: { furniture: id, rotation }, guides: [], readout: `${rotation}°` };
}

/** Where a piece of furniture's rotation handle stands: off its back edge by `gap` (mm) */
export function rotateHandle(p: Project, id: string, gap: number): { edge: Point; handle: Point } | null {
  const f = p.furniture.find(x => x.id === id);
  if (!f) return null;
  const r = (f.rotation * Math.PI) / 180;
  const u: Point = [Math.sin(r), -Math.cos(r)];
  const edge: Point = [f.position[0] + (u[0] * f.size.d) / 2, f.position[1] + (u[1] * f.size.d) / 2];
  return { edge, handle: [edge[0] + u[0] * gap, edge[1] + u[1] * gap] };
}
