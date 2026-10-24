/**
 * Floor plan: SVG in millimetres. Picking, zoom/pan, selection and change highlights, compare with before, dimensions (see
 * dimensions.ts), and dragging the selected wall, door or window, or piece of furniture (see plan-drag.ts).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import { wallBody, type Point, type Project } from '@plinth/core';
import { dragCall, draggable, type DragResult } from './plan-drag';
import { exteriorDimensions, selectionDimensions } from '@/graphics/plan/dimensions';
import { dimensionSize, dimensionStep, frameDimensions, labelSize, levelShapes, MIN_DIMENSION_PX, planFrame, polyPath } from '@/graphics/plan/plan-geometry';
import { PlanDefs, PlanDimensions, PlanInk, PlanLabels, PlanPaper, screenLine } from '@/graphics/plan/PlanDrawing';
import { useRun } from '../panels/common';
import { useEditor } from '../store';
import { m } from '@/lib/i18n';
import { standaloneSvg } from '@/lib/theme';
import { useBuildsVersion } from '@/lib/builds';

const pts = (p: Point[]) => p.map(([x, y]) => `${x},${y}`).join(' ');

/** Render the SVG to PNG (screenshots, image export) */
export async function svgToPng(svg: SVGSVGElement, width = 2000) {
  // The whole drawing with its dimensions, even where the screen's frame leaves them out (see frameDimensions)
  const viewBox = svg.dataset.exportViewbox ?? svg.getAttribute('viewBox')!;
  const [, , vw, vh] = viewBox.split(' ').map(Number);
  const height = Math.round((width * vh) / vw);
  const cs = svg.ownerDocument.defaultView!.getComputedStyle(svg);
  const data = standaloneSvg(svg, { width: String(width), height: String(height), viewBox });
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(data)}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = cs.getPropertyValue('--background');
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return { dataUrl: canvas.toDataURL('image/png'), width, height };
}

export function Plan2D({ svgRef }: { svgRef?: React.RefObject<SVGSVGElement | null> }) {
  const project = useEditor(s => s.project);
  const view = useEditor(s => s.view);
  const select = useEditor(s => s.select);
  const compare = useEditor(s => s.compare);
  const lastChange = useEditor(s => s.lastChange);
  const drag = useDrag();
  // Furniture symbols come from builds that finish later (packages/core/src/looks/cache.ts)
  const builds = useBuildsVersion();
  const shapes = useMemo(() => levelShapes(drag.preview ?? project, view.level), [drag.preview, project, view.level, builds]);
  // Before: draw only the original positions of walls that changed
  const before = useMemo(() => {
    if (!compare || !lastChange) return null;
    const changed = new Set(lastChange.changed);
    const walls = lastChange.before.walls.filter(w => w.level === view.level && changed.has(w.id));
    return polyPath(walls.map(wallBody));
  }, [compare, lastChange, view.level]);
  const zoomRef = useRef<ReactZoomPanPinchRef>(null);

  // The svg's size on screen: the frame makes room for the dimensions only where they read at the fit
  const [size, setSize] = useState({ width: 0, height: 0 });
  const roomForDimensions = view.layers.dimensions && size.width > 0 && frameDimensions(project, view.level, size.width, size.height);
  const frame = planFrame(project, view.level, roomForDimensions);
  const vb = `${frame.x} ${frame.y} ${frame.w} ${frame.h}`;
  const full = planFrame(project, view.level, view.layers.dimensions);
  const exportVb = `${full.x} ${full.y} ${full.w} ${full.h}`;
  const font = labelSize(shapes.bounds);
  // Dimensions follow the drawing, the dragged preview included
  const exterior = useMemo(
    () => (view.layers.dimensions ? exteriorDimensions(drag.preview ?? project, view.level, shapes.bounds, dimensionStep(font)) : []),
    [view.layers.dimensions, drag.preview, project, view.level, shapes.bounds, font],
  );
  const temporary = view.layers.dimensions ? selectionDimensions(drag.preview ?? project, view.selection, dimensionStep(font)) : [];
  // On screen, the exterior chains hide while their values would be too small to read (exports and screenshots keep them)
  const [zoom, setZoom] = useState(1);

  const sel = new Set(view.selection);
  const localRef = useRef<SVGSVGElement>(null);
  const ref = svgRef ?? localRef;
  // Outline of every pickable object, for the selection and change highlights
  const outlines = useMemo(() => {
    const out = new Map<string, string>();
    for (const { s: sp, d } of shapes.spaces) out.set(sp.id, d);
    for (const { f, d } of shapes.furniture) out.set(f.id, d);
    for (const { w, d } of shapes.walls) out.set(w.id, d);
    for (const o of shapes.openings) out.set(o.id, `M${pts(o.outline).replaceAll(' ', 'L')}Z`);
    for (const e of shapes.elements.filter(x => !x.faint)) out.set(e.id, e.fills.map(f => `M${pts(f.ring).replaceAll(' ', 'L')}Z`).join(''));
    return out;
  }, [shapes]);
  const thin = useMemo(() => new Set([...shapes.walls.map(x => x.w.id), ...shapes.openings.map(o => o.id)]), [shapes]);
  // A new highlight restarts the fade: the token goes into the overlay keys
  const changeToken = useMemo(() => Date.now(), [view.highlight]);

  const pick = useCallback(
    (id: string) => (e: React.MouseEvent) => {
      e.stopPropagation();
      select(e.shiftKey || e.metaKey ? (sel.has(id) ? view.selection.filter(x => x !== id) : [...view.selection, id]) : [id]);
    },
    [select, view.selection],
  );

  // Reset zoom when switching floors, and on "fit all"
  const fitRequest = useEditor(s => s.fitRequest);
  useEffect(() => {
    zoomRef.current?.resetTransform(0);
  }, [view.level]);
  useEffect(() => {
    if (fitRequest) zoomRef.current?.resetTransform(300);
  }, [fitRequest]);

  const canEdit = useEditor(s => s.canEdit());
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  const readable = !size.width || dimensionSize(font) * zoom * Math.min(size.width / frame.w, size.height / frame.h) >= MIN_DIMENSION_PX;
  const handle = canEdit && !compare && view.selection.length === 1 && draggable(project, view.selection[0]) ? view.selection[0] : null;

  return (
    <TransformWrapper
      ref={zoomRef}
      onTransform={(_, t) => setZoom(t.scale)}
      minScale={0.5}
      maxScale={20}
      doubleClick={{ disabled: true }}
      wheel={{ step: 0.15 }}
      panning={{ excluded: ['plan-drag'] }}
    >
      <TransformComponent wrapperClass="!w-full !h-full" contentClass="!w-full !h-full">
        <svg
          ref={ref}
          viewBox={vb}
          data-export-viewbox={exportVb}
          className="h-full w-full select-none"
          // Dimension chains may reach past the frame (see frameDimensions): they show when zoomed in
          overflow="visible"
          style={{ background: 'var(--canvas-backdrop)' }}
          onClick={() => select([])}
          role="img"
          aria-label={m.editor_plan_aria({ level: project.levels.find(l => l.id === view.level)?.name ?? '' })}
        >
          <PlanDefs project={project} />
          <PlanPaper project={project} level={view.level} shapes={shapes} line={screenLine} pick={pick} />
          <PlanInk shapes={shapes} furniture={view.layers.furniture} line={screenLine} pick={pick} />

          {/* Just changed (or pointed at by the agent): a tint that fades out. Selected: tinted with an outline until deselected */}
          <g pointerEvents="none" data-feedback>
            {view.highlight
              .filter(id => outlines.has(id) && !sel.has(id))
              .map(id => (
                <path key={`${id}-${changeToken}`} d={outlines.get(id)} fill="var(--chart-1)" className="plan-changed" />
              ))}
            {view.selection
              .filter(id => outlines.has(id))
              .map(id => (
                // Walls, doors and windows are thin: fill them nearly solid so the color reads; rooms and furniture get a light wash
                <path
                  key={id}
                  d={outlines.get(id)}
                  fill="var(--chart-2)"
                  fillOpacity={thin.has(id) ? 0.85 : 0.25}
                  stroke="var(--chart-2)"
                  strokeWidth={2.5}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
          </g>

          {/* Walls before the change: dashed */}
          {before && (
            <g pointerEvents="none">
              <path d={before} fill="none" stroke="var(--foreground)" strokeWidth={1.2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
            </g>
          )}

          {view.layers.labels && <PlanLabels shapes={shapes} pick={pick} />}

          {/* The selected object can be dragged: a handle over it, then snapping guides and the distance while dragging */}
          {handle && outlines.has(handle) && (
            <path
              d={outlines.get(handle)}
              fill="transparent"
              className="plan-drag cursor-move"
              style={{ touchAction: 'none' }}
              onPointerDown={e => drag.start(e, handle, ref.current)}
              onPointerMove={drag.move}
              onPointerUp={drag.end}
              onPointerCancel={drag.cancel}
              onClick={e => {
                e.stopPropagation();
                if (!drag.moved() && (e.shiftKey || e.metaKey)) pick(handle)(e);
              }}
            />
          )}
          {drag.result && (
            <g pointerEvents="none">
              {drag.result.guides.map(([a, b], i) => (
                <line
                  key={i}
                  x1={a[0]}
                  y1={a[1]}
                  x2={b[0]}
                  y2={b[1]}
                  stroke="var(--chart-2)"
                  strokeWidth={1}
                  strokeDasharray="4 3"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {drag.result.readout && drag.pointer && (
                <text
                  x={drag.pointer[0] + 14 * drag.mmPerPx}
                  y={drag.pointer[1] - 14 * drag.mmPerPx}
                  fontSize={12 * drag.mmPerPx}
                  fill="var(--foreground)"
                  fontFamily="var(--font-mono)"
                  paintOrder="stroke"
                  stroke="var(--background)"
                  strokeWidth={3 * drag.mmPerPx}
                >
                  {drag.result.readout}
                </text>
              )}
            </g>
          )}

          {exterior.length > 0 && (
            <g className="plan-dims" data-hidden={readable ? undefined : ''}>
              <PlanDimensions chains={exterior} font={font} line={screenLine} />
            </g>
          )}
          {temporary.length > 0 && (
            <g data-feedback>
              <PlanDimensions chains={temporary} font={font} line={screenLine} />
            </g>
          )}
        </svg>
      </TransformComponent>
    </TransformWrapper>
  );
}

/** Snapping distance in screen pixels */
const SNAP_PX = 8;

/**
 * Dragging the selected object: each move previews the capability call it maps to (on a scratch copy, so connected walls and
 * room areas follow live); releasing runs it once, as one undoable edit.
 */
function useDrag() {
  const project = useEditor(s => s.project);
  const preview = useEditor(s => s.preview);
  const run = useRun();
  const [state, setState] = useState<{ preview: Project | null; result: DragResult | null; pointer: Point | null; mmPerPx: number }>({
    preview: null,
    result: null,
    pointer: null,
    mmPerPx: 1,
  });
  const active = useRef<{ id: string; origin: Point; svg: SVGSVGElement; pointerId: number; key: string; moved: boolean; frame: number } | null>(null);
  const latest = useRef<DragResult | null>(null);

  const toMm = (svg: SVGSVGElement, e: React.PointerEvent): { at: Point; mmPerPx: number } => {
    const m = svg.getScreenCTM()!.inverse();
    const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return { at: [q.x, q.y], mmPerPx: Math.hypot(m.a, m.b) };
  };

  const reset = () => {
    if (active.current) cancelAnimationFrame(active.current.frame);
    active.current = null;
    latest.current = null;
    setState({ preview: null, result: null, pointer: null, mmPerPx: 1 });
  };

  return {
    ...state,
    moved: () => !!active.current?.moved,
    start(e: React.PointerEvent, id: string, svg: SVGSVGElement | null) {
      if (!svg || e.button !== 0) return;
      e.stopPropagation();
      (e.target as Element).setPointerCapture(e.pointerId);
      active.current = { id, origin: toMm(svg, e).at, svg, pointerId: e.pointerId, key: '', moved: false, frame: 0 };
    },
    move(e: React.PointerEvent) {
      const a = active.current;
      if (!a || e.pointerId !== a.pointerId) return;
      const { at, mmPerPx } = toMm(a.svg, e);
      const delta: Point = [at[0] - a.origin[0], at[1] - a.origin[1]];
      // A small wobble on press is a click, not a drag
      if (!a.moved && Math.hypot(delta[0], delta[1]) < 4 * mmPerPx) return;
      a.moved = true;
      const r = dragCall(project, a.id, delta, SNAP_PX * mmPerPx);
      latest.current = r;
      setState(s => ({ ...s, result: r, pointer: at, mmPerPx }));
      const key = r ? JSON.stringify(r.input) : '';
      if (key === a.key) return;
      a.key = key;
      cancelAnimationFrame(a.frame);
      a.frame = requestAnimationFrame(async () => {
        const p = r ? await preview(r.name, r.input) : null;
        // Ignore a preview that arrives after the drag moved on or ended
        if (active.current === a && a.key === key) setState(s => ({ ...s, preview: p }));
      });
    },
    async end(e: React.PointerEvent) {
      const a = active.current;
      if (!a || e.pointerId !== a.pointerId) return;
      const r = a.moved ? latest.current : null;
      if (r) await run(r.name, r.input);
      // Keep "moved" until the click that follows this release has been handled
      setTimeout(reset);
    },
    cancel: reset,
  };
}
