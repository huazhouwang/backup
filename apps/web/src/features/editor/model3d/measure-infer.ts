/**
 * Where the 3D tape measure's next point goes, inferred as SketchUp does: an endpoint of the face under the pointer wins when it
 * is a few pixels away; else, once a first point is set, a direction close to one of the three axes on screen locks the point
 * onto that axis through the first point (red x, green the plan's y, blue up); else the point under the pointer. With Shift the
 * axis already locked stays locked wherever the pointer goes.
 */
import * as THREE from 'three';

export type Axis = 'x' | 'y' | 'z';

/** The axes in three.js coordinates: the plan's x, the plan's y (three's z) and up (three's y) */
export const AXES: Record<Axis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 0, 1),
  z: new THREE.Vector3(0, 1, 0),
};

/** How close the pointer must be to an endpoint, in pixels */
export const SNAP_PX = 14;
/** How far the pointer may stray from an axis on screen, in pixels, and as an angle */
const AXIS_PX = 10;
const AXIS_SIN = Math.sin(THREE.MathUtils.degToRad(7));

export interface Inferred {
  point: THREE.Vector3;
  axis: Axis | null;
  endpoint: boolean;
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
export function axisOnScreen(from: THREE.Vector3, pointer: THREE.Vector2, screen: Screen): Axis | null {
  const a = screen(from);
  const v = pointer.clone().sub(a);
  const len = v.length();
  if (len < AXIS_PX * 1.5) return null;
  let best: { axis: Axis; off: number } | null = null;
  for (const axis of Object.keys(AXES) as Axis[]) {
    const s = screen(from.clone().add(AXES[axis])).sub(a);
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
}): Inferred | null {
  const { ray, pointer, screen, hit, from, held } = opts;
  if (from && held) {
    const p = nearestOnAxis(from, AXES[held], ray);
    if (p) return { point: p, axis: held, endpoint: false };
  }
  const corner = hit && nearestCorner(hit.corners, pointer, screen);
  if (corner) return { point: corner, axis: from ? alongAxis(from, corner) : null, endpoint: true };
  if (from) {
    const axis = axisOnScreen(from, pointer, screen);
    const p = axis && nearestOnAxis(from, AXES[axis], ray);
    if (axis && p) return { point: p, axis, endpoint: false };
  }
  return hit ? { point: hit.point.clone(), axis: from ? alongAxis(from, hit.point) : null, endpoint: false } : null;
}

/** The axis a segment runs along, if it does (within a millimetre) */
export function alongAxis(a: THREE.Vector3, b: THREE.Vector3): Axis | null {
  const d = b.clone().sub(a);
  if (d.length() < 1e-3) return null;
  const off = (u: number, v: number) => Math.abs(u) < 1e-3 && Math.abs(v) < 1e-3;
  if (off(d.y, d.z)) return 'x';
  if (off(d.x, d.y)) return 'y';
  if (off(d.x, d.z)) return 'z';
  return null;
}

/** A measurement's parts in millimetres: the straight length, the horizontal run and the rise */
export function parts(a: THREE.Vector3, b: THREE.Vector3) {
  const d = b.clone().sub(a);
  return { length: Math.round(d.length() * 1000), run: Math.round(Math.hypot(d.x, d.z) * 1000), rise: Math.round(Math.abs(d.y) * 1000) };
}
