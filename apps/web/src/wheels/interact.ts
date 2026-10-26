/**
 * Wheel `interact`: what makes something drawn in the plan behave like the rest of it. Anything can be made selectable (a click
 * selects it, shift adds it; the selection is shared with the editor for the design's own objects) or draggable (followed in
 * plan millimetres, snapped), and anything can offer snap points and snap lines that every tool snaps to: the wall tool, dragging,
 * and whatever a module builds.
 */
import type { Point } from '@plinth/core';
import { bridge } from './bridge';
import type { PlanView } from './plan';

/** Something to snap to: points, and lines through two points (followed past their ends) */
export interface SnapProvider {
  points?(): Point[];
  lines?(): [Point, Point][];
}

export interface Snapped {
  point: Point;
  /** What it snapped to: a point, a line, or two lines crossing */
  kind: 'point' | 'line' | 'cross' | null;
  /** The lines it snapped to, to show while dragging */
  guides: [Point, Point][];
}

const providers = new Set<SnapProvider>();

/** Offer snap points and lines; returns a function that withdraws them */
export function addSnaps(p: SnapProvider): () => void {
  providers.add(p);
  return () => providers.delete(p);
}

const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const len = (v: Point) => Math.hypot(v[0], v[1]);
/** The foot of p on the line through a, b */
const foot = (p: Point, [a, b]: [Point, Point]): Point => {
  const d = sub(b, a),
    l2 = d[0] ** 2 + d[1] ** 2 || 1;
  const t = ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / l2;
  return [a[0] + d[0] * t, a[1] + d[1] * t];
};
const cross = ([a, b]: [Point, Point], [c, d]: [Point, Point]): Point | null => {
  const r = sub(b, a),
    s = sub(d, c);
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  return [a[0] + r[0] * t, a[1] + r[1] * t];
};

/** Every snap point offered now (for snapping that only takes points, like dragging the design's objects) */
export const snapPoints = (): Point[] => [...providers].flatMap(s => s.points?.() ?? []);

/** Where p snaps within `tol` millimetres: a point first, then two lines crossing, then the nearest line; else p itself */
export function snap(p: Point, tol: number): Snapped {
  const points = [...providers].flatMap(s => s.points?.() ?? []);
  const lines = [...providers].flatMap(s => s.lines?.() ?? []);
  let best: Point | null = null,
    bestD = tol;
  for (const q of points) {
    const d = len(sub(q, p));
    if (d <= bestD) [best, bestD] = [q, d];
  }
  if (best) return { point: best, kind: 'point', guides: [] };
  const near = lines.map(l => ({ l, f: foot(p, l) })).filter(x => len(sub(x.f, p)) <= tol);
  for (let i = 0; i < near.length; i++)
    for (let j = i + 1; j < near.length; j++) {
      const c = cross(near[i].l, near[j].l);
      if (c && len(sub(c, p)) <= tol * 1.5) return { point: c, kind: 'cross', guides: [near[i].l, near[j].l] };
    }
  if (near.length) {
    const n = near.reduce((a, b) => (len(sub(a.f, p)) <= len(sub(b.f, p)) ? a : b));
    return { point: n.f, kind: 'line', guides: [n.l] };
  }
  return { point: p, kind: null, guides: [] };
}

/** Make an element selectable under `id`: a click selects it (shift adds it), and it is stippled with the selection when it is one of the design's objects */
export function selectable(el: Element, id: string) {
  el.setAttribute('data-id', id);
  el.classList.add('plan-hit');
  (el as SVGElement).style.cursor = 'pointer';
}

/** Whether an id is selected now, and a way to hear when the selection changes */
export const isSelected = (id: string) => bridge.selection().includes(id);
export const onSelection = (fn: (ids: string[]) => void) => bridge.on('selection', fn);

/** Snapping distance on screen */
export const SNAP_PX = 10;

/**
 * Let an element be dragged: `move` hears the pointer in plan millimetres (snapped, unless snap is false) while it is held, `end`
 * where it was let go (null if it never moved, i.e. a click). Once pressed, the drag follows the pointer anywhere, so the element
 * may be redrawn (replaced) while it is dragged. While a tool has the pointer (view.setTool), the element can't be dragged.
 */
export function draggable(
  view: PlanView,
  el: Element,
  opts: { start?(p: Point): void; move(s: Snapped, e: PointerEvent): void; end(s: Snapped | null, e: PointerEvent): void; snap?: boolean },
) {
  const at = (e: PointerEvent): Snapped => {
    const p = view.toModel(e);
    return opts.snap === false ? { point: p, kind: null, guides: [] } : snap(p, SNAP_PX * view.pxMm());
  };
  el.addEventListener('pointerdown', ev => {
    const e = ev as PointerEvent;
    if (e.button !== 0 || view.tool()) return;
    // Marked as taken: the plan won't pan, and a click without moving still selects
    e.preventDefault();
    const held = { id: e.pointerId, at: view.toModel(e), moved: false };
    opts.start?.(held.at);
    const onMove = (m: PointerEvent) => {
      if (m.pointerId !== held.id) return;
      if (!held.moved && len(sub(view.toModel(m), held.at)) < 3 * view.pxMm()) return;
      held.moved = true;
      opts.move(at(m), m);
    };
    // Captured first, so a drag that moved doesn't also count as a click on whatever is under the pointer
    const onUp = (u: PointerEvent) => {
      if (u.pointerId !== held.id) return;
      removeEventListener('pointermove', onMove, true);
      removeEventListener('pointerup', onUp, true);
      removeEventListener('pointercancel', onUp, true);
      if (held.moved) u.stopPropagation();
      opts.end(held.moved && u.type === 'pointerup' ? at(u) : null, u);
    };
    addEventListener('pointermove', onMove, true);
    addEventListener('pointerup', onUp, true);
    addEventListener('pointercancel', onUp, true);
  });
}
