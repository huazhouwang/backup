/**
 * Floor plan: SVG in millimetres. Picking, zoom/pan, selection and change highlights, compare with before, dimensions (see
 * dimensions.ts), dragging the selected wall, door or window, or piece of furniture (see plan-drag.ts), and what the installed
 * widgets draw, with their handles and snap points (see widgets/).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import { wallBody, type ParamValue, type Point, type Project } from '@plinth/core';
import { dragCall, draggable, rotateCall, rotateHandle, type DragResult } from './plan-drag';
import { placeCall, type PlaceResult } from './plan-place';
import { exteriorDimensions, selectionDimensions } from '@/graphics/plan/dimensions';
import { dimensionScale, levelShapes, planFrame, polyPath } from '@/graphics/plan/plan-geometry';
import { PlanDefs, PlanDimensions, PlanInk, PlanLabels, PlanMarks, PlanPaper, screenLine } from '@/graphics/plan/PlanDrawing';
import { useRun } from '../panels/common';
import { useEditor } from '../store';
import { setHover } from '../hover';
import { m } from '@/lib/i18n';
import { useBuildsVersion } from '@/lib/builds';
import { PlanWidgets } from '../widgets/PlanWidgets';
import { useWidgetCommit } from '../widgets/mine';
import { snapPoints, useWidgetOutputs, type ParamOverrides } from '../widgets/outputs';

const pts = (p: Point[]) => p.map(([x, y]) => `${x},${y}`).join(' ');

export function Plan2D({ svgRef }: { svgRef?: React.RefObject<SVGSVGElement | null> }) {
  const project = useEditor(s => s.project);
  const view = useEditor(s => s.view);
  const select = useEditor(s => s.select);
  const compare = useEditor(s => s.compare);
  const lastChange = useEditor(s => s.lastChange);
  // What the widgets draw on this level; a dragged handle's params stand in until the change is made
  const [overrides, setOverrides] = useState<ParamOverrides>({});
  const widgetOutputs = useWidgetOutputs(project, view.level, 'plan', overrides);
  const commitWidget = useWidgetCommit();
  const snaps = useMemo(() => snapPoints(widgetOutputs, view.level), [widgetOutputs, view.level]);
  const snapsRef = useRef(snaps);
  snapsRef.current = snaps;
  const drag = useDrag(snapsRef);
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

  // The svg's size on screen: the frame holds the dimension chains, sized to read at the fit
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const frame = planFrame(project, view.level, view.layers.dimensions && size);
  const vb = `${frame.x} ${frame.y} ${frame.w} ${frame.h}`;
  // Dimensions follow the drawing (the dragged preview included) and keep a readable size as the plan zooms
  const scale = dimensionScale(shapes.bounds, size.width ? zoom * Math.min(size.width / frame.w, size.height / frame.h) : undefined);
  const exterior = useMemo(
    () => (view.layers.dimensions ? exteriorDimensions(drag.preview ?? project, view.level, shapes.bounds, scale) : []),
    [view.layers.dimensions, drag.preview, project, view.level, shapes.bounds, scale.size],
  );
  const temporary = view.layers.dimensions ? selectionDimensions(drag.preview ?? project, view.selection, scale.step) : [];

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
  // Measured before the first paint: drawn at no size first, the plan would flash at the wrong scale (leaving 3D shows it)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  const handle = canEdit && !compare && view.selection.length === 1 && draggable(project, view.selection[0]) ? view.selection[0] : null;
  // Screen pixels to millimetres at the current zoom, for handles drawn at a fixed screen size
  const pxMm = size.width ? 1 / (zoom * Math.min(size.width / frame.w, size.height / frame.h)) : 10;
  const turn = handle ? rotateHandle(project, handle, 26 * pxMm) : null;

  // Place mode: what is being placed follows the pointer; a click puts it down and selects it
  const placing = useEditor(s => s.placing);
  const setPlacing = useEditor(s => s.setPlacing);
  const run = useRun();
  const [ghost, setGhost] = useState<PlaceResult | null>(null);
  useEffect(() => setGhost(null), [placing, view.level]);
  useEffect(() => () => setHover(null), []);
  const pointMm = (e: React.MouseEvent): Point => {
    const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(ref.current!.getScreenCTM()!.inverse());
    return [q.x, q.y];
  };
  // The section tool: two clicks draw the line, then 3D shows the section looking across it (arrows show which way)
  const sectioning = useEditor(s => s.sectioning);
  const setSectioning = useEditor(s => s.setSectioning);
  const setCamera3d = useEditor(s => s.setCamera3d);
  const setView = useEditor(s => s.setView);
  const [cutFrom, setCutFrom] = useState<Point | null>(null);
  const [cutHover, setCutHover] = useState<Point | null>(null);
  useEffect(() => {
    setCutFrom(null);
    setCutHover(null);
  }, [sectioning, view.level]);
  const cutPoint = (e: React.MouseEvent) => {
    const q = pointMm(e);
    return cutFrom && e.shiftKey ? holdAxis(cutFrom, q) : q;
  };
  const cutClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const q = cutPoint(e);
    if (!cutFrom) return setCutFrom(q);
    if (Math.hypot(q[0] - cutFrom[0], q[1] - cutFrom[1]) < 300) return;
    setCamera3d({ section: { a: cutFrom, b: q }, walking: false });
    setSectioning(false);
    setView({ mode: '3d' });
  };
  const cutLine = cutFrom && cutHover && Math.hypot(cutHover[0] - cutFrom[0], cutHover[1] - cutFrom[1]) > 1 ? ([cutFrom, cutHover] as const) : null;

  const setOverride = (id: string, params: Record<string, ParamValue> | null) =>
    setOverrides(o => {
      const { [id]: _old, ...rest } = o;
      return params ? { ...rest, [id]: params } : rest;
    });

  const place = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!placing) return;
    const r = placeCall(project, view.level, placing, pointMm(e), SNAP_PX * pxMm, snaps);
    if (!r) return;
    const done = await run(r.name, r.input);
    if (!done.ok) return;
    setPlacing(null);
    const id = (done.result as { id?: string } | undefined)?.id;
    if (id) select([id]);
  };

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
      {/* The plan's background behind the drawing too, so zooming out below the fit shows no other colour around it */}
      <TransformComponent wrapperClass="!w-full !h-full" wrapperStyle={{ background: 'var(--canvas-backdrop)' }} contentClass="!w-full !h-full">
        <svg
          ref={ref}
          viewBox={vb}
          className="h-full w-full select-none"
          // Zoomed out, the dimension chains grow past the frame to stay readable
          overflow="visible"
          // Fingers on the plan are ours, not the page's: the zoom pans and pinches, handles drag (SVG
          // shapes can't say so themselves)
          style={{ background: 'var(--canvas-backdrop)', touchAction: 'none' }}
          onClick={() => select([])}
          // The mouse over an object: its name in a tooltip after a pause (see HoverTip)
          onPointerMove={e => {
            if (e.pointerType !== 'mouse' || e.buttons) return setHover(null);
            const id = (e.target as Element).closest('[data-id]')?.getAttribute('data-id');
            setHover(id ? { id, x: e.clientX, y: e.clientY } : null);
          }}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label={m.editor_plan_aria({ level: project.levels.find(l => l.id === view.level)?.name ?? '' })}
        >
          <PlanDefs project={project} />
          <PlanPaper project={project} level={view.level} shapes={shapes} line={screenLine} pick={pick} />
          <PlanInk shapes={shapes} furniture={view.layers.furniture} line={screenLine} pick={pick} />

          {/*
            Selection: under the mouse, a thin outline in the selection blue (canvas.css) and a tooltip with its name (see HoverTip);
            selected, stippled with blue dots as in SketchUp, with its temporary dimensions. Just changed (or pointed at by the agent):
            a blue tint that fades out
          */}
          {/* SketchUp's selection stipple: a dot every few screen pixels, offset on every other row */}
          <defs>
            <pattern id="selection-dots" patternUnits="userSpaceOnUse" width={6 * pxMm} height={6 * pxMm}>
              <rect x={0} y={0} width={1.2 * pxMm} height={1.2 * pxMm} fill="var(--canvas-selection)" />
              <rect x={3 * pxMm} y={3 * pxMm} width={1.2 * pxMm} height={1.2 * pxMm} fill="var(--canvas-selection)" />
            </pattern>
          </defs>
          <g pointerEvents="none" data-feedback>
            {view.highlight
              .filter(id => outlines.has(id) && !sel.has(id))
              .map(id => (
                <path key={`${id}-${changeToken}`} d={outlines.get(id)} fill="var(--chart-2)" className="plan-changed" />
              ))}
            {view.selection
              .filter(id => outlines.has(id))
              .map(id => (
                // As SketchUp draws a selection: stippled with dots in the selection colour over the object's own colours, thin edges
                <path
                  key={id}
                  d={outlines.get(id)}
                  fill="url(#selection-dots)"
                  stroke="var(--canvas-selection)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                  data-selected={id}
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
          <PlanMarks frame={frame} size={scale.size} line={screenLine} />

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
          {/* Furniture turns by a round handle off its back edge, in 15° steps */}
          {turn && (
            <g data-feedback>
              <line
                x1={turn.edge[0]}
                y1={turn.edge[1]}
                x2={turn.handle[0]}
                y2={turn.handle[1]}
                stroke="var(--chart-2)"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={turn.handle[0]}
                cy={turn.handle[1]}
                r={8 * pxMm}
                fill="var(--background)"
                stroke="var(--chart-2)"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                className="plan-drag cursor-grab"
                style={{ touchAction: 'none' }}
                aria-label={m.plan_rotate_handle()}
                onPointerDown={e => drag.start(e, handle!, ref.current, true)}
                onPointerMove={drag.move}
                onPointerUp={drag.end}
                onPointerCancel={drag.cancel}
                onClick={e => e.stopPropagation()}
              />
            </g>
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

          <PlanWidgets
            outputs={widgetOutputs}
            level={view.level}
            pxMm={pxMm}
            toMm={pointMm}
            editable={canEdit && !compare}
            onPreview={(id, params) => setOverride(id, params)}
            onCommit={async (id, params) => {
              await commitWidget(id, params);
              setOverride(id, null);
            }}
          />

          {exterior.length > 0 && <PlanDimensions chains={exterior} size={scale.size} line={screenLine} />}
          {temporary.length > 0 && (
            <g data-feedback>
              <PlanDimensions chains={temporary} size={scale.size} line={screenLine} color="var(--canvas-selection)" />
            </g>
          )}
          {/* The section tool: the line, with arrows at its ends looking across it */}
          {sectioning && (
            <g data-feedback>
              {cutLine &&
                (() => {
                  const [a, b] = cutLine;
                  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
                  const d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
                  // The viewer stands on the line's right-hand side and looks across it
                  const look = [d[1], -d[0]];
                  const s = 14 * pxMm;
                  const arrow = (p: Point) =>
                    `${p[0] + look[0] * s * 1.6},${p[1] + look[1] * s * 1.6} ${p[0] + d[0] * s * 0.6},${p[1] + d[1] * s * 0.6} ${p[0] - d[0] * s * 0.6},${p[1] - d[1] * s * 0.6}`;
                  return (
                    <g pointerEvents="none">
                      <line
                        x1={a[0]}
                        y1={a[1]}
                        x2={b[0]}
                        y2={b[1]}
                        stroke="var(--chart-2)"
                        strokeWidth={2}
                        strokeDasharray="10 4 2 4"
                        vectorEffect="non-scaling-stroke"
                      />
                      <polygon points={arrow(a)} fill="var(--chart-2)" />
                      <polygon points={arrow(b)} fill="var(--chart-2)" />
                    </g>
                  );
                })()}
              {cutFrom && <circle cx={cutFrom[0]} cy={cutFrom[1]} r={4 * pxMm} fill="var(--chart-2)" pointerEvents="none" />}
              <rect
                x={frame.x - frame.w}
                y={frame.y - frame.h}
                width={frame.w * 3}
                height={frame.h * 3}
                fill="transparent"
                className="cursor-crosshair"
                onPointerMove={e => setCutHover(cutPoint(e))}
                onPointerLeave={() => setCutHover(null)}
                onClick={cutClick}
              />
            </g>
          )}
          {/* Place mode: a sheet over the drawing takes the pointer, and the ghost shows where it would go */}
          {placing && (
            <g data-feedback>
              {ghost && (
                <polygon
                  points={pts(ghost.ghost)}
                  fill="var(--chart-2)"
                  fillOpacity={0.3}
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
              )}
              <rect
                x={frame.x - frame.w}
                y={frame.y - frame.h}
                width={frame.w * 3}
                height={frame.h * 3}
                fill="transparent"
                className="cursor-crosshair"
                onPointerMove={e => setGhost(placeCall(project, view.level, placing, pointMm(e), SNAP_PX * pxMm, snaps))}
                onPointerLeave={() => setGhost(null)}
                onClick={place}
              />
            </g>
          )}
        </svg>
      </TransformComponent>
    </TransformWrapper>
  );
}

/** With Shift: the second point on the first one's horizontal or vertical line, whichever is nearer */
const holdAxis = (a: Point, b: Point): Point => (Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? [b[0], a[1]] : [a[0], b[1]]);

/** Snapping distance in screen pixels */
const SNAP_PX = 8;

/**
 * Dragging the selected object: each move previews the capability call it maps to (on a scratch copy, so connected walls and
 * room areas follow live); releasing runs it once, as one undoable edit.
 */
function useDrag(snaps: React.RefObject<Point[]>) {
  const project = useEditor(s => s.project);
  const preview = useEditor(s => s.preview);
  const run = useRun();
  const [state, setState] = useState<{ preview: Project | null; result: DragResult | null; pointer: Point | null; mmPerPx: number }>({
    preview: null,
    result: null,
    pointer: null,
    mmPerPx: 1,
  });
  const active = useRef<{
    id: string;
    origin: Point;
    svg: SVGSVGElement;
    pointerId: number;
    key: string;
    moved: boolean;
    frame: number;
    rotate: boolean;
  } | null>(null);
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
    /** Start dragging an object (`rotate`: turning furniture by its handle) */
    start(e: React.PointerEvent, id: string, svg: SVGSVGElement | null, rotate = false) {
      if (!svg || e.button !== 0) return;
      e.stopPropagation();
      (e.target as Element).setPointerCapture(e.pointerId);
      active.current = { id, origin: toMm(svg, e).at, svg, pointerId: e.pointerId, key: '', moved: false, frame: 0, rotate };
    },
    move(e: React.PointerEvent) {
      const a = active.current;
      if (!a || e.pointerId !== a.pointerId) return;
      const { at, mmPerPx } = toMm(a.svg, e);
      const delta: Point = [at[0] - a.origin[0], at[1] - a.origin[1]];
      // A small wobble on press is a click, not a drag
      if (!a.moved && Math.hypot(delta[0], delta[1]) < 4 * mmPerPx) return;
      a.moved = true;
      const r = a.rotate ? rotateCall(project, a.id, at) : dragCall(project, a.id, delta, SNAP_PX * mmPerPx, snaps.current);
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
