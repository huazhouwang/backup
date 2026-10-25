/**
 * Where a section line cuts the model, as Revit fills cut walls and floors solid (poche): rectangles in the section plane, from the
 * walls whose bodies the line crosses (with the doors and windows it passes through left open) and the floor slabs and roofs it
 * crosses. Millimetres: along the line from its start, and absolute height.
 */
import { dot, footing, roofs, SLAB_THICKNESS, slabShape, sub, wallBody, wallDir, wallHeight, type Point, type Polygon, type Project } from '@plinth/core';
import { hasSlab, slabLevel } from './scene/units';

export interface SectionLine {
  a: Point;
  b: Point;
}

export interface CutRect {
  /** Along the line from its start (mm) */
  s0: number;
  s1: number;
  /** Absolute height (mm) */
  y0: number;
  y1: number;
}

/** The line's direction and its right-hand normal (the side the viewer stands on, looking across) */
export function sectionAxes({ a, b }: SectionLine) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const d: Point = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  return { d, n: [-d[1], d[0]] as Point };
}

/** The stretches of the (infinite) line inside a polygon, as positions along it */
function crossings(line: SectionLine, poly: Polygon): [number, number][] {
  const { d, n } = sectionAxes(line);
  const ts: number[] = [];
  for (const ring of [poly.outer, ...(poly.holes ?? [])])
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i],
        q = ring[(i + 1) % ring.length];
      const dp = dot(sub(p, line.a), n),
        dq = dot(sub(q, line.a), n);
      if ((dp > 0 && dq > 0) || (dp < 0 && dq < 0) || dp === dq) continue;
      const k = dp / (dp - dq);
      ts.push(dot(sub([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k], line.a), d));
    }
  ts.sort((x, y) => x - y);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < ts.length; i += 2) if (ts[i + 1] - ts[i] > 1) out.push([ts[i], ts[i + 1]]);
  return out;
}

export function sectionCuts(p: Project, line: SectionLine): CutRect[] {
  const elev = new Map(p.levels.map(l => [l.id, l.elevation]));
  const { d } = sectionAxes(line);
  const out: CutRect[] = [];
  for (const w of p.walls) {
    if (w.kind === 'railing') continue;
    const e = elev.get(w.level) ?? 0;
    const bottom = e - (w.kind === 'bearing' || w.kind === 'partition' ? footing(e, p.site.groundLevel) : 0),
      top = e + wallHeight(p, w);
    for (const [s0, s1] of crossings(line, wallBody(w))) {
      // Where along the wall the line crosses it: doors and windows there leave the cut open
      const mid: Point = [line.a[0] + d[0] * ((s0 + s1) / 2), line.a[1] + d[1] * ((s0 + s1) / 2)];
      const at = dot(sub(mid, w.start), wallDir(w));
      const gaps = w.openings
        .filter(o => Math.abs(at - o.at) < o.width / 2)
        .map(o => [e + o.sill, e + o.sill + o.height] as const)
        .sort((x, y) => x[0] - y[0]);
      let y = bottom;
      for (const [g0, g1] of gaps) {
        if (g0 > y) out.push({ s0, s1, y0: y, y1: Math.min(g0, top) });
        y = Math.max(y, g1);
      }
      if (top > y) out.push({ s0, s1, y0: y, y1: top });
    }
  }
  for (const s of p.spaces) {
    if (!hasSlab(s)) continue;
    const { y, thickness } = slabLevel(s, elev.get(s.level) ?? 0, p.site.groundLevel);
    for (const poly of slabShape(p, s)) for (const [s0, s1] of crossings(line, poly)) out.push({ s0, s1, y0: y - thickness, y1: y });
  }
  for (const r of roofs(p)) {
    const top = (elev.get(r.level) ?? 0) + r.top;
    for (const poly of r.shape) for (const [s0, s1] of crossings(line, poly)) out.push({ s0, s1, y0: top - SLAB_THICKNESS, y1: top });
  }
  return out;
}

/** A level's elevation as drawings write it, in metres: ±0.000, +3.600, -0.450 */
export const elevationLabel = (mm: number) => (Math.abs(mm) < 0.5 ? '±0.000' : `${mm > 0 ? '+' : '-'}${(Math.abs(mm) / 1000).toFixed(3)}`);
