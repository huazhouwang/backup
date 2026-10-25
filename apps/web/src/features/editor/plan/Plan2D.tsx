/**
 * Floor plan: SVG in millimetres. Picking, zoom/pan, selection and change highlights, compare with before, dimensions (see
 * dimensions.ts), dragging the selected wall, door or window, or piece of furniture (see plan-drag.ts), and moving and turning
 * the model axes once they are selected (see plan-axes.ts).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import { axesOf, findObject, wallBody, type Point, type Project } from '@plinth/core';
import { dragCall, draggable, rotateCall, rotateHandle, type DragResult } from './plan-drag';
import { holdAxis, snapMeasure } from './plan-measure';
import { guideDraft, guideSources, sourceAt, type GuideDraft, type GuideSource } from './plan-guide-draw';
import { clipLine } from './plan-guides';
import { alignToWall, axesDrag, lineRange, TURN_PX, type AxesDrag, type AxesGrab } from './plan-axes';
import { PlanGuides } from './PlanGuides';
import { placeCall, type PlaceResult } from './plan-place';
import { exteriorDimensions, selectionDimensions, type DimChain } from '@/graphics/plan/dimensions';
import { dimensionScale, levelShapes, planFrame, polyPath } from '@/graphics/plan/plan-geometry';
import { PlanDefs, PlanDimensions, PlanInk, PlanAxes, PlanLabels, PlanMarks, PlanPaper, screenLine } from '@/graphics/plan/PlanDrawing';
import { useRun } from '../panels/common';
import { useEditor, useEditorStore } from '../store';
import { m } from '@/lib/i18n';
import { standaloneSvg } from '@/lib/theme';
import { useBuildsVersion } from '@/lib/builds';

const pts = (p: Point[]) => p.map(([x, y]) => `${x},${y}`).join(' ');

/** Render the SVG to PNG (screenshots, image export) */
export async function svgToPng(svg: SVGSVGElement, width = 2000) {
  const vb = svg.viewBox.baseVal;
  const height = Math.round((width * vb.height) / vb.width);
  const cs = svg.ownerDocument.defaultView!.getComputedStyle(svg);
  const data = standaloneSvg(svg, { width: String(width), height: String(height) });
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
  const thin = useMemo(() => new Set([...shapes.walls.map(x => x.w.id), ...shapes.openings.map(o => o.id)]), [shapes]);
  // A new highlight restarts the fade: the token goes into the overlay keys
  const changeToken = useMemo(() => Date.now(), [view.highlight]);

  const store = useEditorStore();
  const run = useRun();
  const pick = useCallback(
    (id: string) => (e: React.MouseEvent) => {
      e.stopPropagation();
      // Aligning the axes: a wall (or a door or window in it) turns red along it
      const s = store.getState();
      const hit = s.axesEdit === 'align' ? findObject(s.project, id) : undefined;
      const wall = hit?.kind === 'wall' ? hit.obj : hit?.kind === 'opening' ? hit.wall : undefined;
      if (wall) {
        void run('axes_set', { angle: alignToWall(wall, axesOf(s.project).angle) }).then(r => r.ok && s.setAxesEdit('handles'));
        return;
      }
      select(e.shiftKey || e.metaKey ? (sel.has(id) ? view.selection.filter(x => x !== id) : [...view.selection, id]) : [id]);
    },
    [select, view.selection, run],
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
  const handle = canEdit && !compare && view.selection.length === 1 && draggable(project, view.selection[0]) ? view.selection[0] : null;
  // Screen pixels to millimetres at the current zoom, for handles drawn at a fixed screen size
  const pxMm = size.width ? 1 / (zoom * Math.min(size.width / frame.w, size.height / frame.h)) : 10;
  const turn = handle ? rotateHandle(project, handle, 26 * pxMm) : null;

  // Place mode: what is being placed follows the pointer; a click puts it down and selects it
  const placing = useEditor(s => s.placing);
  const setPlacing = useEditor(s => s.setPlacing);
  const [ghost, setGhost] = useState<PlaceResult | null>(null);
  useEffect(() => setGhost(null), [placing, view.level]);
  const pointMm = (e: React.MouseEvent): Point => {
    const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(ref.current!.getScreenCTM()!.inverse());
    return [q.x, q.y];
  };
  // The tape measure: two clicks give a distance; measurements stay until the tool is put away
  const measuring = useEditor(s => s.measuring);
  const sectioning = useEditor(s => s.sectioning);
  const [measures, setMeasures] = useState<[Point, Point][]>([]);
  const [from, setFrom] = useState<Point | null>(null);
  const [hover, setHover] = useState<{ point: Point; snapped: string | null } | null>(null);
  useEffect(() => {
    setMeasures([]);
    setFrom(null);
    setHover(null);
  }, [measuring, view.level]);
  const measurePoint = (e: React.MouseEvent) => {
    const s = snapMeasure(project, view.level, pointMm(e), SNAP_PX * pxMm);
    return from && e.shiftKey ? { point: holdAxis(from, s.point, axes), snapped: s.snapped } : s;
  };
  // Dragging off an edge or a corner with the tape draws a guide (see plan-guide-draw.ts); dragging elsewhere pans the plan
  const setGuideEdit = useEditor(s => s.setGuideEdit);
  const sources = useMemo(() => (measuring ? guideSources(project, view.level) : null), [measuring, project, view.level]);
  const [draft, setDraft] = useState<{ g: GuideDraft; at: Point } | null>(null);
  const gesture = useRef<{ id: number; x: number; y: number; moved: boolean; src: GuideSource | null; pan: { x: number; y: number } | null } | null>(null);
  const suppressClick = useRef(false);
  const sheetDown = (e: React.PointerEvent) => {
    if (!e.isPrimary || !sources) return;
    const t = zoomRef.current?.instance.state;
    gesture.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      moved: false,
      src: sourceAt(sources, pointMm(e), SNAP_PX * pxMm),
      pan: t ? { x: t.positionX, y: t.positionY } : null,
    };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const sheetMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return setHover(measurePoint(e));
    if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 6) return;
    g.moved = true;
    if (g.src) {
      const q = pointMm(e);
      const d = canEdit ? guideDraft(g.src, q, view.level, axes) : null;
      setDraft(d && { g: d, at: q });
      setHover(null);
    } else if (g.pan) {
      const t = zoomRef.current?.instance.state;
      if (t) zoomRef.current?.setTransform(g.pan.x + e.clientX - g.x, g.pan.y + e.clientY - g.y, t.scale, 0);
    }
  };
  const sheetUp = async (e: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.id !== e.pointerId || !g.moved) return;
    suppressClick.current = true;
    const d = draft?.g;
    setDraft(null);
    if (!g.src || !d) return;
    let last: string | undefined;
    for (const c of d.calls) {
      const r = await run(c.name, c.input);
      if (!r.ok) return;
      last = (r.result as { id?: string } | undefined)?.id;
    }
    if (last) setGuideEdit({ id: last, origin: d.origin, normal: d.normal, distance: d.distance });
  };
  // The model axes: a tap on the knob at the origin selects them; then their handles move and turn them or draw guides off them,
  // each gesture past a threshold and called off by a second finger (see plan-axes.ts)
  const axesEdit = useEditor(s => s.axesEdit);
  const setAxesEdit = useEditor(s => s.setAxesEdit);
  const axes = useMemo(() => axesOf(project), [project.axes]);
  const axesTool = view.layers.axes && view.mode === '2d' && canEdit && !compare && !measuring && !placing && !sectioning;
  const [axesDraft, setAxesDraft] = useState<{ d: AxesDrag; at: Point } | null>(null);
  const shownAxes = axesDraft?.d.kind === 'axes' ? axesDraft.d.frame : axes;
  const axesGesture = useRef<{ id: number; grab: AxesGrab; from: Point; x: number; y: number; moved: boolean; touch: boolean; draft: AxesDrag | null } | null>(
    null,
  );
  useEffect(() => {
    if (!axesTool) setAxesEdit(null);
  }, [axesTool]);
  useEffect(() => {
    if (view.selection.length) setAxesEdit(null);
  }, [view.selection]);
  const axesCancel = () => {
    axesGesture.current = null;
    setAxesDraft(null);
  };
  useEffect(() => {
    const doc = ref.current?.ownerDocument;
    if (!doc) return;
    // A second finger means a pinch, not the drag: drop it unapplied
    const onDown = (e: PointerEvent) => {
      if (axesGesture.current && e.pointerId !== axesGesture.current.id) axesCancel();
    };
    doc.addEventListener('pointerdown', onDown, true);
    return () => doc.removeEventListener('pointerdown', onDown, true);
  }, [ref]);
  const axesDown = (grab: AxesGrab) => (e: React.PointerEvent) => {
    if (!e.isPrimary || e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    axesGesture.current = { id: e.pointerId, grab, from: pointMm(e), x: e.clientX, y: e.clientY, moved: false, touch: e.pointerType !== 'mouse', draft: null };
  };
  const axesMove = (e: React.PointerEvent) => {
    const g = axesGesture.current;
    if (!g || g.id !== e.pointerId) return;
    // A wobble on press is a tap, not a drag (more for a finger)
    if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) < (g.touch ? 10 : 6)) return;
    g.moved = true;
    const at = pointMm(e);
    g.draft = axesDrag(project, view.level, axes, g.grab, g.from, at, SNAP_PX * pxMm);
    setAxesDraft(g.draft && { d: g.draft, at });
  };
  const axesUp = async (e: React.PointerEvent) => {
    const g = axesGesture.current;
    if (!g || g.id !== e.pointerId) return;
    axesCancel();
    const d = g.moved ? g.draft : null;
    if (!d) return;
    if (d.kind === 'axes') await run(d.call.name, d.call.input);
    else for (const c of d.draft.calls) if (!(await run(c.name, c.input)).ok) return;
  };
  const axesHandle = (grab: AxesGrab) => ({
    className: 'plan-drag',
    style: { touchAction: 'none' as const },
    'data-axes-handle': grab,
    onPointerDown: axesDown(grab),
    onPointerMove: axesMove,
    onPointerUp: axesUp,
    onPointerCancel: axesCancel,
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
  });

  const measureClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    const { point } = measurePoint(e);
    if (!from) return setFrom(point);
    if (Math.hypot(point[0] - from[0], point[1] - from[1]) > 1) setMeasures(ms => [...ms, [from, point]]);
    setFrom(null);
  };
  // The section tool: two clicks draw the line, then 3D shows the section looking across it (arrows show which way)
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
    return cutFrom && e.shiftKey ? holdAxis(cutFrom, q, axes) : q;
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

  const tape = (a: Point, b: Point): DimChain => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dir: Point = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    return { origin: a, dir, normal: [dir[1], -dir[0]], marks: [0, len], ext: 0 };
  };
  const tapes = [...measures, ...(from && hover ? [[from, hover.point] as [Point, Point]] : [])]
    .filter(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]) > 1)
    .map(([a, b]) => tape(a, b));

  const place = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!placing) return;
    const r = placeCall(project, view.level, placing, pointMm(e), SNAP_PX * pxMm);
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
          // Fingers on the plan are ours, not the page's: the zoom pans and pinches, handles drag, the tape draws guides (SVG
          // shapes can't say so themselves)
          style={{ background: 'var(--canvas-backdrop)', touchAction: 'none' }}
          onClick={() => {
            select([]);
            setAxesEdit(null);
          }}
          role="img"
          aria-label={m.editor_plan_aria({ level: project.levels.find(l => l.id === view.level)?.name ?? '' })}
        >
          <PlanDefs project={project} />
          <PlanPaper project={project} level={view.level} shapes={shapes} line={screenLine} pick={pick} />
          <PlanInk shapes={shapes} furniture={view.layers.furniture} line={screenLine} pick={pick} />

          {/*
            The plan's only colour is SketchUp's selection blue. Just changed (or pointed at by the agent): a blue tint that fades
            out (SketchUp has no such hint, so it borrows the selection colour). Selected: tinted with an outline until deselected
          */}
          <g pointerEvents="none" data-feedback>
            {view.highlight
              .filter(id => outlines.has(id) && !sel.has(id))
              .map(id => (
                <path key={`${id}-${changeToken}`} d={outlines.get(id)} fill="var(--chart-2)" className="plan-changed" />
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

          {view.layers.axes && <PlanAxes frame={frame} axes={shownAxes} line={screenLine} px={pxMm} />}
          {view.layers.guides && (
            <PlanGuides project={project} frame={frame} selected={sel} pick={measuring || placing || sectioning ? undefined : pick} pxMm={pxMm} />
          )}
          {view.layers.labels && <PlanLabels shapes={shapes} pick={pick} />}
          <PlanMarks frame={frame} size={scale.size} line={screenLine} />

          {/* The model axes: the knob at the origin selects them; selected, their handles (see plan-axes.ts) */}
          {axesTool && !axesEdit && (
            <g data-feedback>
              <circle
                cx={axes.origin[0]}
                cy={axes.origin[1]}
                r={4 * pxMm}
                fill="var(--background)"
                stroke="var(--foreground)"
                {...screenLine(1.5)}
                pointerEvents="none"
              />
              <circle
                cx={axes.origin[0]}
                cy={axes.origin[1]}
                r={12 * pxMm}
                fill="transparent"
                className="cursor-pointer"
                role="button"
                aria-label={m.axes_select()}
                data-axes-knob
                onClick={e => {
                  e.stopPropagation();
                  select([]);
                  setAxesEdit('handles');
                }}
              />
            </g>
          )}
          {axesTool && axesEdit && (
            <g data-feedback data-axes-edit={axesEdit}>
              {(['x', 'y'] as const).map(k => {
                const d = shownAxes[k];
                const r = lineRange(shownAxes.origin, d, [frame.x, frame.y, frame.w, frame.h]);
                if (!r) return null;
                const [a, b] = r.map(t => [shownAxes.origin[0] + d[0] * t, shownAxes.origin[1] + d[1] * t]);
                return (
                  <line
                    key={k}
                    x1={a[0]}
                    y1={a[1]}
                    x2={b[0]}
                    y2={b[1]}
                    stroke="transparent"
                    strokeWidth={22}
                    vectorEffect="non-scaling-stroke"
                    aria-label={m.axes_drag_guide()}
                    {...axesHandle(k)}
                    className="plan-drag cursor-copy"
                  />
                );
              })}
              {(() => {
                const o = shownAxes.origin;
                const t: Point = [o[0] + shownAxes.x[0] * TURN_PX * pxMm, o[1] + shownAxes.x[1] * TURN_PX * pxMm];
                return (
                  <>
                    <circle cx={t[0]} cy={t[1]} r={8 * pxMm} fill="var(--background)" stroke="var(--axis-x)" {...screenLine(2)} pointerEvents="none" />
                    <circle
                      cx={t[0]}
                      cy={t[1]}
                      r={18 * pxMm}
                      fill="transparent"
                      aria-label={m.axes_turn()}
                      {...axesHandle('turn')}
                      className="plan-drag cursor-grab"
                    />
                    <rect
                      x={o[0] - 6 * pxMm}
                      y={o[1] - 6 * pxMm}
                      width={12 * pxMm}
                      height={12 * pxMm}
                      fill="var(--background)"
                      stroke="var(--chart-2)"
                      {...screenLine(2)}
                      pointerEvents="none"
                    />
                    <rect
                      x={o[0] - 16 * pxMm}
                      y={o[1] - 16 * pxMm}
                      width={32 * pxMm}
                      height={32 * pxMm}
                      fill="transparent"
                      aria-label={m.axes_origin()}
                      {...axesHandle('origin')}
                      className="plan-drag cursor-move"
                    />
                  </>
                );
              })()}
              {axesDraft && (
                <g pointerEvents="none">
                  {axesDraft.d.kind === 'guide' && <GuideDraftMark draft={axesDraft.d.draft} at={axesDraft.at} frame={frame} pxMm={pxMm} />}
                  {axesDraft.d.kind === 'axes' && (
                    <text
                      x={axesDraft.at[0] + 14 * pxMm}
                      y={axesDraft.at[1] - 14 * pxMm}
                      fontSize={12 * pxMm}
                      fill="var(--chart-2)"
                      fontFamily="var(--font-mono)"
                      paintOrder="stroke"
                      stroke="var(--background)"
                      strokeWidth={3 * pxMm}
                      data-axes-readout
                    >
                      {axesDraft.d.readout}
                    </text>
                  )}
                </g>
              )}
            </g>
          )}

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

          {exterior.length > 0 && <PlanDimensions chains={exterior} size={scale.size} line={screenLine} />}
          {temporary.length > 0 && (
            <g data-feedback>
              <PlanDimensions chains={temporary} size={scale.size} line={screenLine} />
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
          {/* The tape measure: a sheet over the drawing takes the clicks; the snapped point shows as a dot */}
          {measuring && (
            <g data-feedback>
              <PlanDimensions chains={tapes} size={scale.size} line={screenLine} color="var(--chart-2)" />
              {[...measures.flat(), ...(from ? [from] : [])].map((q, i) => (
                <circle key={i} cx={q[0]} cy={q[1]} r={3 * pxMm} fill="var(--chart-2)" pointerEvents="none" />
              ))}
              {draft && <GuideDraftMark draft={draft.g} at={draft.at} frame={frame} pxMm={pxMm} />}
              {hover && (
                <circle
                  cx={hover.point[0]}
                  cy={hover.point[1]}
                  r={(hover.snapped ? 6 : 4) * pxMm}
                  fill={hover.snapped === 'corner' ? 'var(--chart-2)' : 'none'}
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
                // Not panned by the zoom: the sheet pans itself where a drag doesn't draw a guide
                className="plan-drag cursor-crosshair"
                style={{ touchAction: 'none' }}
                onPointerDown={sheetDown}
                onPointerMove={sheetMove}
                onPointerUp={sheetUp}
                onPointerCancel={() => {
                  gesture.current = null;
                  setDraft(null);
                }}
                onPointerLeave={() => setHover(null)}
                onClick={measureClick}
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
                onPointerMove={e => setGhost(placeCall(project, view.level, placing, pointMm(e), SNAP_PX * pxMm))}
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

/** A guide being drawn: its line across the plan, its end point, and its offset by the pointer */
function GuideDraftMark({ draft, at, frame, pxMm }: { draft: GuideDraft; at: Point; frame: { x: number; y: number; w: number; h: number }; pxMm: number }) {
  const seg = clipLine({ id: '', ...draft.line }, [frame.x - frame.w, frame.y - frame.h, frame.w * 3, frame.h * 3]);
  return (
    <g pointerEvents="none">
      {seg && <line x1={seg[0][0]} y1={seg[0][1]} x2={seg[1][0]} y2={seg[1][1]} stroke="var(--chart-2)" strokeDasharray="8 5" {...screenLine(1.5)} />}
      {draft.point && <circle cx={draft.point[0]} cy={draft.point[1]} r={4 * pxMm} fill="var(--chart-2)" />}
      <text
        x={at[0] + 14 * pxMm}
        y={at[1] - 14 * pxMm}
        fontSize={12 * pxMm}
        fill="var(--chart-2)"
        fontFamily="var(--font-mono)"
        paintOrder="stroke"
        stroke="var(--background)"
        strokeWidth={3 * pxMm}
        data-guide-draft={draft.distance}
      >
        {draft.distance}
      </text>
    </g>
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
      const r = a.rotate ? rotateCall(project, a.id, at) : dragCall(project, a.id, delta, SNAP_PX * mmPerPx);
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
