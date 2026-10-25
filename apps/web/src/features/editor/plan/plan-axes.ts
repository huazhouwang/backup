/**
 * Editing the model axes in the plan (see Axes in the core schema), as SketchUp's Axes tool: once the axes are selected, dragging
 * the origin moves it (snapping to corners), dragging the knob on the red axis turns them in 15° steps, and dragging an axis draws
 * a guide parallel to it. Tapping a wall in 'align' turns red along it. Each gesture ends in one capability call.
 */
import { axesFrame, normalAngle, wallDir, type AxesFrame, type Point, type Project, type Wall } from '@plinth/core';
import { guideDraft, guideSources, type GuideDraft } from './plan-guide-draw';
export { lineRange } from '@/graphics/plan/PlanDrawing';

/** What a gesture on the axes grabbed */
export type AxesGrab = 'origin' | 'turn' | 'x' | 'y';

/** Turning steps (degrees) */
export const AXES_STEP = 15;
/** How far the turning knob stands from the origin, in screen pixels */
export const TURN_PX = 90;

export type AxesDrag =
  | { kind: 'axes'; frame: AxesFrame; call: { name: string; input: Record<string, unknown> }; readout: string; snapped: boolean }
  | { kind: 'guide'; draft: GuideDraft };

/**
 * Where a drag from `from` to `to` (plan mm) takes the axes `f` on `level`: the moved or turned axes and the axes_set call, or the
 * guide drawn off an axis; null before it has moved far enough to change anything. `tol` is the snapping distance (mm).
 */
export function axesDrag(p: Project, level: string, f: AxesFrame, grab: AxesGrab, from: Point, to: Point, tol: number): AxesDrag | null {
  if (grab === 'origin') {
    // The origin follows the pointer from where it was grabbed, and snaps to corners and crossings (the world origin too)
    const q: Point = [f.origin[0] + to[0] - from[0], f.origin[1] + to[1] - from[1]];
    let best: { at: Point; d: number } | null = null;
    for (const c of guideSources(p, level, axesFrame()).corners) {
      const d = Math.hypot(c[0] - q[0], c[1] - q[1]);
      if (d <= tol && (!best || d < best.d)) best = { at: c, d };
    }
    const origin: Point = best ? [Math.round(best.at[0]), Math.round(best.at[1])] : [Math.round(q[0] / 10) * 10, Math.round(q[1] / 10) * 10];
    if (origin[0] === f.origin[0] && origin[1] === f.origin[1]) return null;
    return {
      kind: 'axes',
      frame: axesFrame({ origin, angle: f.angle }),
      call: { name: 'axes_set', input: { origin } },
      readout: `${(origin[0] / 1000).toFixed(2)}, ${(origin[1] / 1000).toFixed(2)}`,
      snapped: !!best,
    };
  }
  if (grab === 'turn') {
    const v = [to[0] - f.origin[0], to[1] - f.origin[1]];
    if (Math.hypot(v[0], v[1]) < tol) return null;
    const angle = normalAngle(Math.round((Math.atan2(v[1], v[0]) * 180) / Math.PI / AXES_STEP) * AXES_STEP);
    if (angle === normalAngle(f.angle)) return null;
    return { kind: 'axes', frame: axesFrame({ origin: f.origin, angle }), call: { name: 'axes_set', input: { angle } }, readout: `${angle}°`, snapped: true };
  }
  // Off an axis: a guide parallel to it, measured from the point of the axis nearest to where the drag started
  const dir = grab === 'x' ? f.x : f.y;
  const t = (from[0] - f.origin[0]) * dir[0] + (from[1] - f.origin[1]) * dir[1];
  const a: Point = [f.origin[0] + dir[0] * t, f.origin[1] + dir[1] * t];
  const draft = guideDraft({ kind: 'edge', a, b: [a[0] + dir[0], a[1] + dir[1]] }, to, level, f);
  return draft && { kind: 'guide', draft };
}

/** The angle that turns the red axis along a wall: of the wall's four square directions, the one nearest the axes' angle now */
export function alignToWall(w: Wall, angle: number): number {
  const [dx, dy] = wallDir(w);
  const base = (Math.atan2(dy, dx) * 180) / Math.PI;
  const turns = [0, 90, 180, 270].map(k => normalAngle(base + k));
  const off = (a: number) => Math.min(Math.abs(a - angle), 360 - Math.abs(a - angle));
  const best = turns.sort((a, b) => off(a) - off(b))[0];
  return Math.round(best * 100) / 100;
}

/**
 * The project's walls, furniture and guides seen in the axes' coordinates, so snapping that works along the world axes works along
 * the model axes (placing and dragging furniture square to a turned house). Furniture rotation is counted from the red axis.
 */
export function inAxes(p: Project, f: AxesFrame): Project {
  if (!f.angle && !f.origin[0] && !f.origin[1]) return p;
  const r = (v: number[]): [number, number] => [v[0] * f.x[0] + v[1] * f.x[1], v[0] * f.y[0] + v[1] * f.y[1]];
  const at = (q: Point): Point => r([q[0] - f.origin[0], q[1] - f.origin[1]]);
  return {
    ...p,
    walls: p.walls.map(w => ({ ...w, start: at(w.start), end: at(w.end) })),
    furniture: p.furniture.map(x => ({ ...x, position: at(x.position), rotation: normalAngle(x.rotation - f.angle) })),
    guides: (p.guides ?? []).map(g => {
      const q = at([g.at[0], g.at[1]]);
      return { ...g, at: [q[0], q[1], g.at[2]], ...(g.dir ? { dir: [...r(g.dir), g.dir[2]] as [number, number, number] } : {}) };
    }),
  };
}
