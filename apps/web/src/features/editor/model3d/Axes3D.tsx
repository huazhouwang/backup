/**
 * The model axes in 3D (see Axes in the core schema): x, y and z in black, thick and round-ended, with a triangle head named by its
 * axis, crossing at an origin on the ground; and the copies of them people make as guides (x₁, y₂, z₁ …), drawn the same way.
 *
 * Nothing moves without a tap first, so a drag across them still turns the camera:
 * - a tap on the origin puts it in move mode: a handle on it drags it on the ground, snapping to wall and furniture corners;
 * - a tap on an axis shows a button by it that copies it as a guide;
 * - a tap on a copy selects it: handles on both sides slide it on the ground (an x or y copy across itself, a z copy anywhere), and
 *   one on its head turns it in 15° steps (an x or y copy about its tail in the horizontal plane; a z copy tips over like a fan from
 *   its foot, toward the pointer).
 * Drags start past a few pixels and a second finger calls them off; each ends in one capability call. Taps are found on screen
 * (and not through a wall in front), before the picker sees them (see claimTap in interaction.tsx).
 */
import { Html, Line } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { axesOrigin, type Guide, type Point } from '@plinth/core';
import { CopyPlusIcon, MoveIcon, RotateCwIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';
import { useCanvasDocument } from '@/canvas/CanvasFrame';
import { M } from '@/graphics/three/scene';
import { m } from '@/lib/i18n';
import { themeColor } from '@/lib/theme';
import { guideSources } from '../plan/plan-guide-draw';
import { useRun } from '../panels/common';
import { useEditor } from '../store';
import { claimTap } from './interaction';

const none = () => null;
const marks = { measure: true, noEdges: true };
type AxisName = 'x' | 'y' | 'z';

/** A plan point and a height (mm) in three.js coordinates: x east, y up, z the plan's y */
const at3 = (q: Point, h = 0) => new THREE.Vector3(q[0] * M, h * M, q[1] * M);
/** A plan direction (x east, y south, z up) in three.js coordinates */
const dir3 = (d: readonly number[]) => new THREE.Vector3(d[0], d[2] ?? 0, d[1]).normalize();
const AXIS_DIR: Record<AxisName, [number, number, number]> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

/** How near a tap must be to the origin, an axis or a copy, in pixels (more for a finger) */
const TAP_PX = 10;
const TURN_STEP = 15;
const snapAngle = (deg: number) => Math.round(deg / TURN_STEP) * TURN_STEP;
const step = (v: number) => Math.round(v / 10) * 10;

/** A draft of what a drag would make, drawn while dragging */
type Draft = { origin?: Point; guide?: { id: string; at: [number, number, number]; dir: [number, number, number] }; readout: string };
type Grab = { kind: 'origin' } | { kind: 'slide' | 'turn'; guide: Guide };

export function Axes3D({ reach }: { reach: number }) {
  const project = useEditor(s => s.project);
  const selection = useEditor(s => s.view.selection);
  const axesEdit = useEditor(s => s.axesEdit);
  const setAxesEdit = useEditor(s => s.setAxesEdit);
  const select = useEditor(s => s.select);
  const canEdit = useEditor(s => s.canEdit());
  const busy = useEditor(s => s.measuring || s.camera3d.walking || !!s.camera3d.section);
  const run = useRun();
  const doc = useCanvasDocument();
  const { gl, camera, scene, raycaster, invalidate } = useThree();
  const black = themeColor('--foreground', doc),
    blue = themeColor('--chart-2', doc);
  const active = canEdit && !busy;
  const origin = axesOrigin(project);
  const copies = useMemo(() => (project.guides ?? []).filter(g => g.axis && g.dir), [project.guides]);
  const selected = active && selection.length === 1 ? copies.find(g => g.id === selection[0]) : undefined;
  const [draft, setDraft] = useState<Draft | null>(null);
  const shownOrigin = draft?.origin ?? origin;
  const head = reach * 0.03;
  const fat = useMemo(() => (doc.defaultView?.matchMedia('(pointer: coarse)').matches ? 1.8 : 1), [doc]);

  // Leaving 3D or taking out another tool ends the move mode
  useEffect(() => {
    if (!active) setAxesEdit(null);
  }, [active]);
  useEffect(() => () => setAxesEdit(null), []);

  /** The pointer's ray, and a point on screen in pixels */
  const view = useMemo(() => {
    const rect = () => gl.domElement.getBoundingClientRect();
    return {
      ray(x: number, y: number) {
        const r = rect();
        raycaster.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera);
        return raycaster.ray.clone();
      },
      screen(p: THREE.Vector3) {
        const r = rect();
        const q = p.clone().project(camera);
        return new THREE.Vector2(r.left + ((q.x + 1) / 2) * r.width, r.top + ((1 - q.y) / 2) * r.height);
      },
      /**
       * How far the first object under the pointer is (a wall, a floor: not the ground), to tell a mark in front of a wall from one
       * behind it
       */
      surface(x: number, y: number) {
        this.ray(x, y);
        const hit = raycaster
          .intersectObjects(scene.children, true)
          .find(h => (h.object as THREE.Mesh).isMesh && !h.object.userData.measure && owned(h.object));
        return hit?.distance ?? Infinity;
      },
      ground(x: number, y: number): Point | null {
        const p = this.ray(x, y).intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
        return p && [p.x / M, p.z / M];
      },
    };
  }, [gl, camera, raycaster, scene]);

  // Taps: on the origin, an axis or a copy (in front of whatever is behind them)
  const state = useRef({ origin, copies, active, axesEdit });
  state.current = { origin, copies, active, axesEdit };
  useEffect(() => {
    const el = gl.domElement;
    let down: { x: number; y: number; id: number } | null = null;
    const onDown = (e: PointerEvent) => {
      down = !down && e.isPrimary && e.button === 0 ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null;
    };
    const onUp = (e: PointerEvent) => {
      const d = down;
      down = null;
      const s = state.current;
      if (!s.active || !d || d.id !== e.pointerId || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;
      const pointer = new THREE.Vector2(e.clientX, e.clientY);
      const tol = TAP_PX * (e.pointerType === 'mouse' ? 1 : 2);
      const ray = view.ray(e.clientX, e.clientY);
      const wall = view.surface(e.clientX, e.clientY);
      // The axes lie on the floors they cross: a little way behind the surface still counts as on it
      const seen = (p: THREE.Vector3) => p.distanceTo(ray.origin) < wall + 0.25;
      /** How near the pointer a line from `a` along `u` (both ways, `len` long) passes on screen, and its point nearest the ray */
      const near = (a: THREE.Vector3, u: THREE.Vector3, len: number) => {
        let best = Infinity;
        for (const [p, q] of [
          [a, a.clone().addScaledVector(u, len)],
          [a, a.clone().addScaledVector(u, -len)],
        ]) {
          const sp = view.screen(p),
            sq = view.screen(q);
          const v = sq.clone().sub(sp);
          const t = v.lengthSq() ? THREE.MathUtils.clamp(pointer.clone().sub(sp).dot(v) / v.lengthSq(), 0, 1) : 0;
          if (!seen(p.clone().lerp(q, t))) continue;
          best = Math.min(best, sp.clone().addScaledVector(v, t).distanceTo(pointer));
        }
        return best;
      };
      const o = at3(s.origin);
      // Right on the origin it wins; elsewhere near it, an axis passing closer does
      const od = seen(o) ? view.screen(o).distanceTo(pointer) : Infinity;
      const closest = Math.min(...(['x', 'y', 'z'] as const).map(k => near(o, dir3(AXIS_DIR[k]), reach)));
      if (od <= tol * 0.6 || (od <= tol * 1.4 && od <= closest)) {
        claimTap(e);
        select([]);
        setAxesEdit('origin');
        return;
      }
      const copy = s.copies
        .map(g => ({ g, d: near(at3([g.at[0], g.at[1]], g.at[2]), dir3(g.dir!), reach) }))
        .filter(c => c.d <= tol)
        .sort((a, b) => a.d - b.d)[0];
      if (copy) {
        claimTap(e);
        setAxesEdit(null);
        select([copy.g.id]);
        return;
      }
      const axis = (['x', 'y', 'z'] as const)
        .map(k => ({ k, d: near(o, dir3(AXIS_DIR[k]), reach) }))
        .filter(c => c.d <= tol)
        .sort((a, b) => a.d - b.d)[0];
      if (axis) {
        claimTap(e);
        select([]);
        setAxesEdit(axis.k);
        return;
      }
      // Anywhere else: the picker takes it, and the axes let go
      if (s.axesEdit) setAxesEdit(null);
    };
    // Before the picker, which listens on the same element
    el.addEventListener('pointerdown', onDown, true);
    el.addEventListener('pointerup', onUp, true);
    return () => {
      el.removeEventListener('pointerdown', onDown, true);
      el.removeEventListener('pointerup', onUp, true);
    };
  }, [gl, view, reach]);

  // Drags start on the handles (DOM elements over the canvas, so the camera never sees them)
  const gesture = useRef<{ id: number; grab: Grab; x: number; y: number; from: Point; moved: boolean; touch: boolean; draft: Draft | null } | null>(null);
  const cancel = () => {
    gesture.current = null;
    setDraft(null);
    invalidate();
  };
  useEffect(() => {
    // A second finger means a pinch: drop the drag unapplied
    const onDown = (e: PointerEvent) => {
      if (gesture.current && e.pointerId !== gesture.current.id) cancel();
    };
    doc.addEventListener('pointerdown', onDown, true);
    return () => doc.removeEventListener('pointerdown', onDown, true);
  }, [doc]);

  const drafted = (g: Grab, from: Point, to: Point, e: PointerEvent | React.PointerEvent): Draft | null => {
    const pointer = new THREE.Vector2(e.clientX, e.clientY);
    const snapTol = TAP_PX * 1.4 * (e.pointerType === 'mouse' ? 1 : 2);
    /** A corner on the ground near the pointer on screen (wall and furniture corners, guide crossings) */
    const corner = (q: Point) => {
      const ground = [...project.levels].sort((a, b) => a.elevation - b.elevation)[0]?.id;
      const corners = ground ? guideSources(project, ground).corners : [];
      let best: { c: Point; d: number } | null = null;
      for (const c of corners) {
        const d = view.screen(at3(c)).distanceTo(pointer);
        if (d <= snapTol && (!best || d < best.d)) best = { c, d };
      }
      return best ? ([Math.round(best.c[0]), Math.round(best.c[1])] as Point) : ([step(q[0]), step(q[1])] as Point);
    };
    if (g.kind === 'origin') {
      const q = corner([origin[0] + to[0] - from[0], origin[1] + to[1] - from[1]]);
      return { origin: q, readout: `${(q[0] / 1000).toFixed(2)}, ${(q[1] / 1000).toFixed(2)}` };
    }
    const { guide } = g;
    const d = guide.dir!;
    const tilted = guide.axis === 'z';
    if (g.kind === 'slide') {
      if (tilted) {
        const q = corner([guide.at[0] + to[0] - from[0], guide.at[1] + to[1] - from[1]]);
        return { guide: { id: guide.id, at: [q[0], q[1], guide.at[2]], dir: d }, readout: `${Math.round(Math.hypot(q[0] - guide.at[0], q[1] - guide.at[1]))}` };
      }
      const len = Math.hypot(d[0], d[1]) || 1;
      const n = [-d[1] / len, d[0] / len];
      const off = step((to[0] - from[0]) * n[0] + (to[1] - from[1]) * n[1]);
      return {
        guide: { id: guide.id, at: [Math.round(guide.at[0] + n[0] * off), Math.round(guide.at[1] + n[1] * off), guide.at[2]], dir: d },
        readout: `${Math.abs(off)}`,
      };
    }
    // Turning
    const v = [to[0] - guide.at[0], to[1] - guide.at[1]];
    if (Math.hypot(v[0], v[1]) < 1) return null;
    const az = (snapAngle((Math.atan2(v[1], v[0]) * 180) / Math.PI) * Math.PI) / 180;
    if (!tilted) {
      const deg = ((((az * 180) / Math.PI) % 360) + 360) % 360;
      return { guide: { id: guide.id, at: guide.at, dir: [round6(Math.cos(az)), round6(Math.sin(az)), 0] }, readout: `${deg}°` };
    }
    // A z copy tips toward the pointer, in the upright plane through its foot that way
    const foot = at3([guide.at[0], guide.at[1]], guide.at[2]);
    const across = new THREE.Vector3(-Math.sin(az), 0, Math.cos(az));
    const q = view.ray(e.clientX, e.clientY).intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(across, foot), new THREE.Vector3());
    if (!q) return null;
    const w = q.sub(foot);
    const out = w.x * Math.cos(az) + w.z * Math.sin(az);
    const tilt = THREE.MathUtils.clamp(snapAngle((Math.atan2(Math.max(out, 0), Math.max(w.y, 0)) * 180) / Math.PI), 0, 90);
    const t = (tilt * Math.PI) / 180;
    return {
      guide: { id: guide.id, at: guide.at, dir: [round6(Math.sin(t) * Math.cos(az)), round6(Math.sin(t) * Math.sin(az)), round6(Math.cos(t))] },
      readout: `${tilt}°`,
    };
  };

  const handle = (grab: Grab) => ({
    onPointerDown(e: React.PointerEvent) {
      if (!e.isPrimary || e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      const from = view.ground(e.clientX, e.clientY);
      if (from) gesture.current = { id: e.pointerId, grab, x: e.clientX, y: e.clientY, from, moved: false, touch: e.pointerType !== 'mouse', draft: null };
    },
    onPointerMove(e: React.PointerEvent) {
      const g = gesture.current;
      if (!g || g.id !== e.pointerId) return;
      // A wobble on press is a tap, not a drag (more for a finger)
      if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) < (g.touch ? 10 : 6)) return;
      g.moved = true;
      const to = view.ground(e.clientX, e.clientY);
      if (!to) return;
      g.draft = drafted(g.grab, g.from, to, e);
      setDraft(g.draft);
      invalidate();
    },
    async onPointerUp(e: React.PointerEvent) {
      const g = gesture.current;
      if (!g || g.id !== e.pointerId) return;
      cancel();
      const d = g.moved ? g.draft : null;
      if (!d) return;
      if (d.origin) await run('axes_set', { origin: d.origin });
      else if (d.guide && g.grab.kind === 'slide') await run('guide_move', { guide: d.guide.id, at: [d.guide.at[0], d.guide.at[1]] });
      else if (d.guide) await run('guide_move', { guide: d.guide.id, direction: d.guide.dir });
    },
    onPointerCancel: cancel,
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
  });

  const copy = async (axis: AxisName) => {
    const r = await run('guide_add', { axis });
    const id = (r.result as { id?: string } | undefined)?.id;
    setAxesEdit(null);
    if (r.ok && id) select([id]);
  };

  const o3 = at3(shownOrigin);
  const shown = (g: Guide) => (draft?.guide?.id === g.id ? { ...g, at: draft.guide.at, dir: draft.guide.dir } : g);
  const sel = selected && shown(selected);
  const handlePx = Math.round(32 * (fat > 1 ? 1.4 : 1));
  const knob = 'flex items-center justify-center rounded-full bg-background text-foreground shadow-md ring-1 ring-foreground/20 select-none';

  return (
    <group>
      {(['x', 'y', 'z'] as const).map(k => (
        <AxisMark key={k} at={o3} dir={dir3(AXIS_DIR[k])} reach={reach} head={head} color={axesEdit === k ? blue : black} width={4} label={k} />
      ))}
      {copies.map(g => {
        const s = shown(g);
        return (
          <AxisMark
            key={g.id}
            at={at3([s.at[0], s.at[1]], s.at[2])}
            dir={dir3(s.dir!)}
            reach={reach * 0.8}
            head={head * 0.85}
            color={g.id === selected?.id ? blue : black}
            width={3}
            label={g.name}
            copy={g.id}
          />
        );
      })}
      {/* The origin: a dot on the ground (an empty mark over it says where, on screen), a handle in move mode */}
      <Html position={o3} zIndexRange={[10, 0]} pointerEvents="none">
        <span data-axes-origin={shownOrigin.join(',')} />
      </Html>
      <mesh position={o3} raycast={none} userData={marks}>
        <sphereGeometry args={[head * 0.3, 16, 12]} />
        <meshBasicMaterial color={axesEdit === 'origin' ? blue : black} />
      </mesh>
      {active && axesEdit === 'origin' && (
        <Html position={o3} center zIndexRange={[30, 20]}>
          <div
            className={knob}
            style={{ width: handlePx, height: handlePx, touchAction: 'none' }}
            aria-label={m.axes_move_origin()}
            data-axes-handle="origin"
            {...handle({ kind: 'origin' })}
          >
            <MoveIcon className="size-4" />
          </div>
        </Html>
      )}
      {/* An axis tapped: copy it as a guide */}
      {active && axesEdit && axesEdit !== 'origin' && (
        <Html position={o3.clone().addScaledVector(dir3(AXIS_DIR[axesEdit]), reach * 0.45)} center zIndexRange={[30, 20]}>
          <Button size="sm" variant="outline" className="bg-background shadow-md" onClick={() => void copy(axesEdit)} data-axes-clone={axesEdit}>
            <CopyPlusIcon /> {m.axes_copy()}
          </Button>
        </Html>
      )}
      {/* A copy selected: slide it by the handles on both sides, turn it by its head */}
      {sel &&
        (() => {
          const a = at3([sel.at[0], sel.at[1]], sel.at[2]);
          const u = dir3(sel.dir!);
          const len = reach * 0.8;
          const tip = a.clone().addScaledVector(u, len - head * 0.85 * 0.5);
          const mid = a.clone().addScaledVector(u, len * 0.35);
          const side = sel.axis === 'z' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(-u.z, 0, u.x).normalize();
          const sides = sel.axis === 'z' ? [0] : [1, -1];
          return (
            <>
              {sides.map((k, i) => (
                <Beside key={i} at={k ? mid : a} toward={side} px={k * handlePx * 0.8}>
                  <Html center zIndexRange={[30, 20]}>
                    <div
                      className={knob}
                      style={{ width: handlePx, height: handlePx, touchAction: 'none' }}
                      aria-label={m.axes_slide()}
                      data-axes-handle="slide"
                      {...handle({ kind: 'slide', guide: selected! })}
                    >
                      <MoveIcon className="size-4" />
                    </div>
                  </Html>
                </Beside>
              ))}
              <Html position={tip} center zIndexRange={[30, 20]}>
                <div
                  className={knob}
                  style={{ width: handlePx, height: handlePx, opacity: 0.85, touchAction: 'none' }}
                  aria-label={m.axes_turn()}
                  data-axes-handle="turn"
                  {...handle({ kind: 'turn', guide: selected! })}
                >
                  <RotateCwIcon className="size-4" />
                </div>
              </Html>
            </>
          );
        })()}
      {draft && (
        <Html
          position={draft.origin ? o3 : sel ? at3([sel.at[0], sel.at[1]], sel.at[2]) : o3}
          zIndexRange={[30, 20]}
          pointerEvents="none"
          style={{ transform: 'translate(18px, -150%)' }}
        >
          <div
            data-axes-readout={draft.readout}
            className="rounded-md bg-background px-1.5 py-px font-mono text-xs whitespace-nowrap text-foreground shadow ring-1 ring-foreground/20"
          >
            {draft.readout}
          </div>
        </Html>
      )}
    </group>
  );
}

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

/** Whether a mesh shows a project object (its userData.id, or a parent's) */
function owned(o: THREE.Object3D) {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (typeof p.userData.id === 'string') return true;
  return false;
}

/** An axis or a copy: solid with a triangle head on its positive side, dashed behind, its name by the head */
function AxisMark({
  at,
  dir,
  reach,
  head,
  color,
  width,
  label,
  copy,
}: {
  at: THREE.Vector3;
  dir: THREE.Vector3;
  reach: number;
  head: number;
  color: string;
  width: number;
  label: string;
  copy?: string;
}) {
  const end = at.clone().addScaledVector(dir, reach);
  return (
    <group>
      <Line points={[at, end.clone().addScaledVector(dir, -head * 0.9)]} color={color} lineWidth={width} raycast={none} userData={marks} />
      <Line
        points={[at, at.clone().addScaledVector(dir, -reach)]}
        color={color}
        lineWidth={width * 0.5}
        dashed
        dashSize={0.25}
        gapSize={0.2}
        raycast={none}
        userData={marks}
      />
      <mesh
        position={end.clone().addScaledVector(dir, -head / 2)}
        quaternion={new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)}
        raycast={none}
        userData={marks}
      >
        <coneGeometry args={[head * 0.38, head, 24]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <Html position={end} zIndexRange={[10, 0]} pointerEvents="none" style={{ transform: 'translate(8px, -110%)' }}>
        <span className="font-mono text-sm font-semibold text-foreground select-none" data-axis-label={label} data-axis-copy={copy}>
          {label}
        </span>
      </Html>
    </group>
  );
}

/** Its children `px` screen pixels from `at` toward `toward`, however near the camera is */
function Beside({ at, toward, px, children }: { at: THREE.Vector3; toward: THREE.Vector3; px: number; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ camera, size, invalidate }) => {
    const g = ref.current;
    if (!g) return;
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 50;
    const perPx = (at.distanceTo(camera.position) * 2 * Math.tan(((fov / 2) * Math.PI) / 180)) / size.height;
    const to = at.clone().addScaledVector(toward, px * perPx);
    // The labels over the canvas follow on the next frame
    if (to.distanceToSquared(g.position) > 1e-8) {
      g.position.copy(to);
      invalidate();
    }
  });
  return (
    <group ref={ref} position={at}>
      {children}
    </group>
  );
}
