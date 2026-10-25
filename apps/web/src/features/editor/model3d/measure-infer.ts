/**
 * Where the 3D tape measure's next point goes, inferred as SketchUp does: an endpoint of the face under the pointer wins when it
 * is a few pixels away; else, once a first point is set, a direction close to one of the three axes on screen locks the point
 * onto that axis through the first point (red x, green the plan's y, blue up; red and green turned with the model axes, see Axes in
 * the core schema); else the point under the pointer. With Shift the axis already locked stays locked wherever the pointer goes.
 */
import type { AxesFrame } from '@plinth/core';
import * as THREE from 'three';

export type Axis = 'x' | 'y' | 'z';

export type AxisSet = Record<Axis, THREE.Vector3>;

/** The axes in three.js coordinates: the plan's x, the plan's y (three's z) and up (three's y) */
export const AXES: AxisSet = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 0, 1),
  z: new THREE.Vector3(0, 1, 0),
};

/** The model axes in three.js coordinates */
export const axesIn3D = (f: AxesFrame): AxisSet => ({
  x: new THREE.Vector3(f.x[0], 0, f.x[1]),
  y: new THREE.Vector3(f.y[0], 0, f.y[1]),
  z: AXES.z,
});

/** How close the pointer must be to an endpoint, in pixels */
export const SNAP_PX = 14;
/** How far the pointer may stray from an axis on screen, in pixels, and as an angle */
const AXIS_PX = 10;
const AXIS_SIN = Math.sin(THREE.MathUtils.degToRad(7));

export interface Inferred {
  point: THREE.Vector3;
  axis: Axis | null;
  endpoint: boolean;
  /** On an edge a guide can be dragged off (before the first point) */
  edge?: boolean;
}

/** A point on the screen in pixels */
export type Screen = (p: THREE.Vector3) => THREE.Vector2;

/** The point of the line `from + t·axis` nearest to the ray, or null when the ray runs along the line */
export function nearestOnAxis(from: THREE.Vector3, axis: THREE.Vector3, ray: THREE.Ray): THREE.Vector3 | null {
  const w = from.clone().sub(ray.origin);
  const b = axis.dot(ray.direction);
  const den = 1 - b * b;
  if (den < 1e-6) return null;
  const t = (b * ray.direction.dot(w) - axis.dot(w)) / den;
  return from.clone().addScaledVector(axis, t);
}

/** The axis the pointer follows on screen from the first point, if any */
export function axisOnScreen(from: THREE.Vector3, pointer: THREE.Vector2, screen: Screen, axes: AxisSet = AXES): Axis | null {
  const a = screen(from);
  const v = pointer.clone().sub(a);
  const len = v.length();
  if (len < AXIS_PX * 1.5) return null;
  let best: { axis: Axis; off: number } | null = null;
  for (const axis of Object.keys(axes) as Axis[]) {
    const s = screen(from.clone().add(axes[axis])).sub(a);
    // An axis seen end on has no direction on screen
    if (s.length() < 1e-3) continue;
    s.normalize();
    const off = Math.abs(s.x * v.y - s.y * v.x);
    if (off <= Math.max(AXIS_PX, len * AXIS_SIN) && (!best || off < best.off)) best = { axis, off };
  }
  return best?.axis ?? null;
}

/** The nearest corner of a triangle within SNAP_PX of the pointer */
export function nearestCorner(corners: THREE.Vector3[], pointer: THREE.Vector2, screen: Screen): THREE.Vector3 | null {
  let best: { p: THREE.Vector3; d: number } | null = null;
  for (const p of corners) {
    const d = screen(p).distanceTo(pointer);
    if (d <= SNAP_PX && (!best || d < best.d)) best = { p, d };
  }
  return best ? best.p.clone() : null;
}

/**
 * The next point: `hit` is the surface under the pointer (with the corners of its face) or null; `from` the first point once
 * set; `held` the axis Shift holds.
 */
export function infer(opts: {
  ray: THREE.Ray;
  pointer: THREE.Vector2;
  screen: Screen;
  hit: { point: THREE.Vector3; corners: THREE.Vector3[] } | null;
  from: THREE.Vector3 | null;
  held: Axis | null;
  /** Guides to snap to (three.js coordinates) */
  guides?: GuideRef[];
  /** The model axes */
  axes?: AxisSet;
}): Inferred | null {
  const { ray, pointer, screen, hit, from, held, guides = [], axes = AXES } = opts;
  const along = (a: THREE.Vector3, b: THREE.Vector3) => alongAxis(a, b, axes);
  if (from && held) {
    const p = nearestOnAxis(from, axes[held], ray);
    if (p) return { point: p, axis: held, endpoint: false };
  }
  const corner = hit && nearestCorner(hit.corners, pointer, screen);
  if (corner) return { point: corner, axis: from ? along(from, corner) : null, endpoint: true };
  const onGuide = nearestOnGuides(guides, ray, pointer, screen);
  if (onGuide) return { point: onGuide, axis: from ? along(from, onGuide) : null, endpoint: true };
  if (from) {
    const axis = axisOnScreen(from, pointer, screen, axes);
    const p = axis && nearestOnAxis(from, axes[axis], ray);
    if (axis && p) return { point: p, axis, endpoint: false };
  }
  return hit ? { point: hit.point.clone(), axis: from ? along(from, hit.point) : null, endpoint: false } : null;
}

/** The axis a segment runs along, if it does (within a millimetre) */
export function alongAxis(a: THREE.Vector3, b: THREE.Vector3, axes: AxisSet = AXES): Axis | null {
  const d = b.clone().sub(a);
  const len = d.length();
  if (len < 1e-3) return null;
  for (const axis of Object.keys(axes) as Axis[])
    if (
      d
        .clone()
        .sub(axes[axis].clone().multiplyScalar(d.dot(axes[axis])))
        .length() < 1e-3
    )
      return axis;
  return null;
}

/** A measurement's parts in millimetres: the straight length, the horizontal run and the rise */
export function parts(a: THREE.Vector3, b: THREE.Vector3) {
  const d = b.clone().sub(a);
  return { length: Math.round(d.length() * 1000), run: Math.round(Math.hypot(d.x, d.z) * 1000), rise: Math.round(Math.abs(d.y) * 1000) };
}

/** A guide in three.js coordinates: a line through `at` along `dir`, or a point */
export interface GuideRef {
  at: THREE.Vector3;
  dir?: THREE.Vector3;
}

/** The point of a guide nearest the pointer, within SNAP_PX on screen */
export function nearestOnGuides(guides: GuideRef[], ray: THREE.Ray, pointer: THREE.Vector2, screen: Screen): THREE.Vector3 | null {
  let best: { p: THREE.Vector3; d: number } | null = null;
  for (const g of guides) {
    const p = g.dir ? nearestOnAxis(g.at, g.dir, ray) : g.at.clone();
    if (!p || p.clone().sub(ray.origin).dot(ray.direction) <= 0) continue;
    const d = screen(p).distanceTo(pointer);
    if (d <= SNAP_PX && (!best || d < best.d)) best = { p, d };
  }
  return best?.p ?? null;
}

/** How close the pointer must be to an edge to drag a guide off it, in pixels */
const EDGE_PX = 10;

/**
 * The edge of the face under the pointer that a guide can be dragged off: one running along an axis (a slab edge, a wall top),
 * within EDGE_PX on screen; its point nearest the pointer and its direction
 */
export function edgeNear(
  corners: THREE.Vector3[],
  pointer: THREE.Vector2,
  screen: Screen,
  axes: AxisSet = AXES,
): { at: THREE.Vector3; dir: THREE.Vector3 } | null {
  let best: { at: THREE.Vector3; dir: THREE.Vector3; d: number } | null = null;
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i],
      b = corners[(i + 1) % corners.length];
    const dir = b.clone().sub(a);
    const len = dir.length();
    if (len < 1e-3) continue;
    dir.divideScalar(len);
    if (Math.max(Math.abs(dir.x), Math.abs(dir.y), Math.abs(dir.z)) < 1 - 1e-4 && !Object.values(axes).some(u => Math.abs(dir.dot(u)) > 1 - 1e-4)) continue;
    const sa = screen(a),
      sb = screen(b);
    const s = sb.clone().sub(sa);
    const t = s.lengthSq() ? THREE.MathUtils.clamp(pointer.clone().sub(sa).dot(s) / s.lengthSq(), 0, 1) : 0;
    const d = sa.clone().addScaledVector(s, t).distanceTo(pointer);
    if (d <= EDGE_PX && (!best || d < best.d)) best = { at: a.clone().lerp(b, t), dir, d };
  }
  return best && { at: best.at, dir: best.dir };
}

/**
 * Dragging a guide off an edge: it stays parallel to the edge and moves across it in the face's plane, following the pointer, on a
 * 10 mm step. The offset (m, signed) and the guide's point
 */
export function guideOffset(
  edge: { at: THREE.Vector3; dir: THREE.Vector3 },
  normal: THREE.Vector3,
  ray: THREE.Ray,
): { offset: number; at: THREE.Vector3 } | null {
  const across = normal.clone().cross(edge.dir).normalize();
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, edge.at);
  const p = ray.intersectPlane(plane, new THREE.Vector3());
  if (!p) return null;
  const offset = Math.round(p.sub(edge.at).dot(across) * 100) / 100;
  return { offset, at: edge.at.clone().addScaledVector(across, offset) };
}
