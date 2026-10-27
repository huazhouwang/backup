/**
 * Wheel `walls`: drawing walls in the plan. Click where a wall starts and where it ends (snapped to whatever offers snaps: wall
 * ends, a module's lines…; shift keeps it level or upright); each one is added through wall_add, so the building rules check it
 * and it undoes like any edit, and the next starts where it ended. Esc stops.
 */
import type { Point } from '@opensu/core';
import { m } from '@/lib/i18n';
import { bridge, report } from './bridge';
import { snap, SNAP_PX } from './interact';
import { svgEl, type PlanView, type Tool } from './plan';

const axisLock = (from: Point, p: Point): Point => (Math.abs(p[0] - from[0]) >= Math.abs(p[1] - from[1]) ? [p[0], from[1]] : [from[0], p[1]]);

/** The wall tool for a plan, to pass to view.setTool */
export function wallTool(view: PlanView, opts: { kind?: 'bearing' | 'partition'; thickness?: number; onDone?(id: string): void } = {}): Tool {
  const layer = view.layer('tool');
  let from: Point | null = null;
  let busy = false;
  const clear = () => layer.replaceChildren();
  const at = (p: Point, e: PointerEvent) => {
    const s = snap(from && e.shiftKey ? axisLock(from, p) : p, SNAP_PX * view.pxMm());
    return { ...s, point: from && e.shiftKey ? axisLock(from, s.point) : s.point };
  };
  const draw = (p: Point, guides: [Point, Point][]) => {
    clear();
    const k = view.pxMm();
    for (const [a, b] of guides)
      layer.appendChild(
        svgEl('line', {
          x1: a[0],
          y1: a[1],
          x2: b[0],
          y2: b[1],
          stroke: 'var(--canvas-selection)',
          'stroke-dasharray': '4 3',
          'vector-effect': 'non-scaling-stroke',
          'stroke-width': 1,
        }),
      );
    if (from) {
      layer.appendChild(
        svgEl('line', {
          x1: from[0],
          y1: from[1],
          x2: p[0],
          y2: p[1],
          stroke: 'var(--foreground)',
          'stroke-width': (opts.thickness ?? 120) / k,
          'stroke-opacity': 0.35,
          'vector-effect': 'non-scaling-stroke',
        }),
      );
      const t = svgEl('text', {
        x: (from[0] + p[0]) / 2,
        y: (from[1] + p[1]) / 2 - 8 * k,
        'font-size': 12 * k,
        'text-anchor': 'middle',
        fill: 'var(--foreground)',
      });
      t.textContent = m.wheels_wall_length({ length: (Math.hypot(p[0] - from[0], p[1] - from[1]) / 1000).toFixed(2) });
      layer.appendChild(t);
    }
    layer.appendChild(svgEl('circle', { cx: p[0], cy: p[1], r: 4 * k, fill: 'var(--canvas-selection)', 'data-wall-tool-cursor': '' }));
  };
  return {
    cursor: 'crosshair',
    move(p, e) {
      const s = at(p, e);
      draw(s.point, s.guides);
    },
    down(p, e) {
      const end = at(p, e).point;
      if (!from) {
        from = end;
        draw(end, []);
        return true;
      }
      if (Math.hypot(end[0] - from[0], end[1] - from[1]) < 100 || busy) return true;
      const start = from;
      busy = true;
      void bridge
        .call('wall_add', { level: bridge.level(), start, end, kind: opts.kind ?? 'partition', ...(opts.thickness ? { thickness: opts.thickness } : {}) })
        .then(r => {
          busy = false;
          if (!r.ok) return report('walls', new Error(r.error?.message ?? 'wall_add failed'));
          from = end;
          const id = (r.result as { id?: string } | undefined)?.id;
          if (id) opts.onDone?.(id);
        });
      return true;
    },
    stop() {
      from = null;
      clear();
    },
  };
}
