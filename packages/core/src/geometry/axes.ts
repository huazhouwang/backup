/**
 * The model axes as a frame (see Axes in schema.ts): red along `x`, green along `y`, both unit plan vectors, crossing at `origin`.
 * Without project axes they are the world's.
 */
import type { Axes, Point, Project } from '../model/schema.js';

export interface AxesFrame {
  origin: Point;
  angle: number;
  /** The red axis, a unit plan vector */
  x: Point;
  /** The green axis, a quarter turn clockwise from red on the plan (south when red points east) */
  y: Point;
}

export const WORLD_AXES: Axes = { origin: [0, 0], angle: 0 };

export function axesFrame(a: Axes = WORLD_AXES): AxesFrame {
  const r = (a.angle * Math.PI) / 180;
  const c = Math.cos(r),
    s = Math.sin(r);
  const clean = (v: number) => (Math.abs(v) < 1e-12 ? 0 : v);
  return { origin: a.origin, angle: a.angle, x: [clean(c), clean(s)], y: [clean(-s), clean(c)] };
}

/** The project's axes as a frame */
export const axesOf = (p: Pick<Project, 'axes'>): AxesFrame => axesFrame(p.axes);

/** Whether the axes have been moved or turned */
export const customAxes = (p: Pick<Project, 'axes'>) => !!p.axes && (p.axes.angle % 360 !== 0 || p.axes.origin[0] !== 0 || p.axes.origin[1] !== 0);

/** A world plan point in the axes' coordinates */
export function toAxes(f: AxesFrame, q: Point): Point {
  const d = [q[0] - f.origin[0], q[1] - f.origin[1]];
  return [d[0] * f.x[0] + d[1] * f.x[1], d[0] * f.y[0] + d[1] * f.y[1]];
}

/** A point in the axes' coordinates back in the world */
export function fromAxes(f: AxesFrame, q: Point): Point {
  return [f.origin[0] + q[0] * f.x[0] + q[1] * f.y[0], f.origin[1] + q[0] * f.x[1] + q[1] * f.y[1]];
}

/** An angle in [0, 360) */
export const normalAngle = (deg: number) => ((deg % 360) + 360) % 360;
