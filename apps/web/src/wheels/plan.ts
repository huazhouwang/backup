/**
 * Wheel `plan`: the plan of the current level in an SVG, drawn exactly as the editor draws it (graphics/plan, the same
 * components rendered to markup), with panning and zooming, the selection stippled as in SketchUp, and layers above the drawing
 * for modules to draw in. Coordinates are plan millimetres (x east, y south). A tool can take the pointer over (setTool).
 */
import type { Point, Project } from '@plinth/core';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlanDefs, PlanInk, PlanLabels, PlanPaper, screenLine } from '@/graphics/plan/PlanDrawing';
import { levelShapes, planFrame, type LevelShapes } from '@/graphics/plan/plan-geometry';
import { bridge } from './bridge';

const SVG = 'http://www.w3.org/2000/svg';
export const svgEl = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};

/** A tool: given the pointer (in plan millimetres) while it is active; returning true from down() keeps the plan from panning */
export interface Tool {
  cursor?: string;
  down?(p: Point, e: PointerEvent): boolean | void;
  move?(p: Point, e: PointerEvent): void;
  up?(p: Point, e: PointerEvent): void;
  key?(e: KeyboardEvent): void;
  stop?(): void;
}

export interface PlanView {
  svg: SVGSVGElement;
  /** A group above the drawing for a module to draw in (created on first use; later names lie higher) */
  layer(name: string): SVGGElement;
  /** A pointer position in plan millimetres */
  toModel(e: { clientX: number; clientY: number }): Point;
  /** Millimetres per screen pixel at the current zoom */
  pxMm(): number;
  /** The drawing's shapes on the current level (walls, spaces, openings, furniture), as the editor computes them */
  shapes(): LevelShapes;
  /** Let a tool take the pointer (null gives it back to selecting and panning) */
  setTool(tool: Tool | null): void;
  /** Fit the level in view */
  fit(): void;
  /** Listen for redraws (after the design, level or zoom changed) */
  onDraw(fn: () => void): () => void;
}

const pts = (p: Point[]) => p.map(([x, y]) => `${x},${y}`).join(' ');

/** Mount the plan in `container` (filling it) */
export function mount(container: HTMLElement): PlanView {
  const svg = svgEl('svg', { class: 'plinth-plan' });
  svg.style.cssText = 'display:block;width:100%;height:100%;background:var(--canvas-backdrop);touch-action:none;user-select:none';
  const base = svgEl('g', { 'data-layer': 'base' });
  const selection = svgEl('g', { 'data-layer': 'selection', 'pointer-events': 'none' });
  const layers = svgEl('g', { 'data-layer': 'modules' });
  for (const g of [base, selection, layers]) svg.appendChild(g);
  container.appendChild(svg);

  let vb = { x: 0, y: 0, w: 1, h: 1 };
  let shapes: LevelShapes = levelShapes(bridge.project(), bridge.level());
  let tool: Tool | null = null;
  const drawListeners = new Set<() => void>();
  const named = new Map<string, SVGGElement>();

  const size = () => ({ width: svg.clientWidth || 1, height: svg.clientHeight || 1 });
  const pxMm = () => Math.max(vb.w / size().width, vb.h / size().height);
  const applyViewBox = () => svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  const toModel = (e: { clientX: number; clientY: number }): Point => {
    const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
    return [q.x, q.y];
  };
  const fit = () => {
    const f = planFrame(bridge.project(), bridge.level(), size());
    vb = { x: f.x, y: f.y, w: f.w, h: f.h };
    applyViewBox();
    drawSelection();
    notify();
  };
  const notify = () => drawListeners.forEach(fn => fn());

  const drawBase = (p: Project) => {
    shapes = levelShapes(p, bridge.level());
    const pick = () => () => {};
    base.innerHTML = renderToStaticMarkup(
      createElement(
        Fragment,
        null,
        createElement(PlanDefs, { project: p }),
        createElement(PlanPaper, { project: p, level: bridge.level(), shapes, line: screenLine, pick }),
        createElement(PlanInk, { shapes, furniture: true, line: screenLine, pick }),
        createElement(PlanLabels, { shapes, pick }),
      ),
    );
  };

  /** Outlines of the design's objects on this level, for the selection stipple */
  const outline = (id: string): string | undefined => {
    const s = shapes.spaces.find(x => x.s.id === id) ?? shapes.furniture.find(x => x.f.id === id) ?? shapes.walls.find(x => x.w.id === id);
    if (s) return s.d;
    const o = shapes.openings.find(x => x.id === id);
    if (o) return `M${pts(o.outline).replaceAll(' ', 'L')}Z`;
    const e = shapes.elements.find(x => x.id === id && !x.faint);
    return e?.fills.map(f => `M${pts(f.ring).replaceAll(' ', 'L')}Z`).join('');
  };
  const drawSelection = () => {
    const k = pxMm();
    const dots = `<defs><pattern id="plinth-selection-dots" patternUnits="userSpaceOnUse" width="${6 * k}" height="${6 * k}"><rect width="${1.2 * k}" height="${1.2 * k}" fill="var(--canvas-selection)"/><rect x="${3 * k}" y="${3 * k}" width="${1.2 * k}" height="${1.2 * k}" fill="var(--canvas-selection)"/></pattern></defs>`;
    selection.innerHTML =
      dots +
      bridge
        .selection()
        .flatMap(id => {
          const d = outline(id);
          return d
            ? [
                `<path d="${d}" fill="url(#plinth-selection-dots)" stroke="var(--canvas-selection)" stroke-width="1" vector-effect="non-scaling-stroke" data-selected="${id}"/>`,
              ]
            : [];
        })
        .join('');
  };

  // Zoom about the pointer
  svg.addEventListener(
    'wheel',
    e => {
      e.preventDefault();
      const [mx, my] = toModel(e);
      const f = Math.exp(Math.sign(e.deltaY) * 0.15);
      vb = { x: mx - (mx - vb.x) * f, y: my - (my - vb.y) * f, w: vb.w * f, h: vb.h * f };
      applyViewBox();
      drawSelection();
      notify();
    },
    { passive: false },
  );

  // Pointer: a tool if one is active; else a press on an object selects it, and a drag on the background pans
  let pan: { x: number; y: number; vb: typeof vb; moved: boolean; id: number; held: boolean } | null = null;
  svg.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const p = toModel(e);
    if (tool?.down?.(p, e)) return;
    if (tool) return;
    // A press something draggable took (interact.draggable) doesn't pan, but a click on it still selects
    pan = { x: e.clientX, y: e.clientY, vb: { ...vb }, moved: false, id: e.pointerId, held: e.defaultPrevented };
  });
  svg.addEventListener('pointermove', e => {
    if (tool) return tool.move?.(toModel(e), e);
    if (!pan || pan.id !== e.pointerId || pan.held) return;
    const dx = e.clientX - pan.x,
      dy = e.clientY - pan.y;
    if (!pan.moved && Math.hypot(dx, dy) < 4) return;
    if (!pan.moved) svg.setPointerCapture(e.pointerId);
    pan.moved = true;
    const k = pxMm();
    vb = { ...vb, x: pan.vb.x - dx * k, y: pan.vb.y - dy * k };
    applyViewBox();
  });
  svg.addEventListener('pointerup', e => {
    if (tool) return tool.up?.(toModel(e), e);
    const was = pan;
    pan = null;
    if (!was || was.moved) return notify();
    const id = (e.target as Element).closest('[data-id]')?.getAttribute('data-id');
    const sel = bridge.selection();
    if (!id) return bridge.select([]);
    bridge.select(e.shiftKey || e.metaKey ? (sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]) : [id]);
  });
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && tool) {
      e.preventDefault();
      tool.stop?.();
      setTool(null);
    } else tool?.key?.(e);
  });

  const setTool = (t: Tool | null) => {
    tool?.stop?.();
    tool = t;
    svg.style.cursor = t?.cursor ?? '';
  };

  bridge.on('project', p => {
    drawBase(p);
    drawSelection();
    notify();
  });
  bridge.on('level', () => {
    drawBase(bridge.project());
    fit();
  });
  bridge.on('selection', () => drawSelection());
  new ResizeObserver(() => fit()).observe(svg);

  drawBase(bridge.project());
  fit();

  return {
    svg,
    layer(name) {
      let g = named.get(name);
      if (!g) {
        g = svgEl('g', { 'data-layer': name });
        layers.appendChild(g);
        named.set(name, g);
      }
      return g;
    },
    toModel,
    pxMm,
    shapes: () => shapes,
    setTool,
    fit,
    onDraw(fn) {
      drawListeners.add(fn);
      return () => drawListeners.delete(fn);
    },
  };
}
