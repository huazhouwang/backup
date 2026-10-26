/**
 * What the installed widgets draw, in 3D: each item on the floor of its level (its own, else the current one), in the widget
 * colour; labels as DOM text facing the screen. Handles are discs an editor drags across their floor: a press on one is taken
 * before the orbit controls and the picker see it, the pointer is followed on the floor's plane (50 mm steps), and releasing
 * makes the change. Ignored by picking, edges, walking and the sun (userData.mark).
 */
import type { ParamValue, Point, Project } from '@plinth/core';
import { Html, Line } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useCanvasDocument } from '@/canvas/CanvasFrame';
import { M } from '@/graphics/three/scene';
import { themeColor } from '@/lib/theme';
import { useEditorStore } from '../store';
import { itemsOn, useWidgetOutputs, type ParamOverrides } from '../widgets/outputs';

const none = () => null;
const marks = { mark: true, noEdges: true };
/** Just above the floor, under nothing that stands on it */
const LIFT = 0.03;
const STEP = 50;
const snap = (v: number) => Math.round(v / STEP) * STEP;

type HandleData = { widget: string; x: string; y: string; height: number };

export function Widgets3D({ project, current, editable }: { project: Project; current: string; editable: boolean }) {
  const doc = useCanvasDocument();
  const color = themeColor('--canvas-widget', doc);
  const [overrides, setOverrides] = useState<ParamOverrides>({});
  const outputs = useWidgetOutputs(project, current, '3d', overrides);
  const heightOf = useMemo(() => new Map(project.levels.map(l => [l.id, l.elevation * M + LIFT])), [project.levels]);
  const at = (p: Point, level: string) => new THREE.Vector3(p[0] * M, heightOf.get(level) ?? LIFT, p[1] * M);
  const items = project.levels.flatMap(l => itemsOn(outputs, l.id, current).map(x => ({ ...x, level: l.id })));
  useHandleDrag(editable, setOverrides);

  const segments: THREE.Vector3[] = [];
  const dashed: THREE.Vector3[] = [];
  for (const { item, level } of items) if (item.type === 'line') (item.dash?.length ? dashed : segments).push(at(item.from, level), at(item.to, level));

  return (
    <group userData={marks}>
      {segments.length > 0 && <Line points={segments} segments color={color} lineWidth={1.5} raycast={none} userData={marks} />}
      {dashed.length > 0 && (
        <Line points={dashed} segments dashed dashSize={0.3} gapSize={0.15} color={color} lineWidth={1.5} raycast={none} userData={marks} />
      )}
      {items.map(({ widget, item, level }, i) => {
        const key = `${widget}-${i}`;
        switch (item.type) {
          case 'label':
            return (
              <Html key={key} position={at(item.at, level)} center zIndexRange={[5, 0]} pointerEvents="none" style={{ pointerEvents: 'none' }}>
                <span className="font-mono text-[11px] whitespace-nowrap text-[var(--canvas-widget)] select-none" data-widget={widget} data-widget-item="label">
                  {item.text}
                </span>
              </Html>
            );
          case 'point':
            return (
              <mesh key={key} position={at(item.at, level)} raycast={none} userData={marks}>
                <sphereGeometry args={[0.05, 12, 8]} />
                <meshBasicMaterial color={color} />
              </mesh>
            );
          case 'area': {
            const shape = new THREE.Shape(item.outline.map(([x, y]) => new THREE.Vector2(x * M, -y * M)));
            return (
              <mesh key={key} position={[0, heightOf.get(level) ?? LIFT, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={none} userData={marks}>
                <shapeGeometry args={[shape]} />
                <meshBasicMaterial color={color} transparent opacity={0.12} depthWrite={false} side={THREE.DoubleSide} />
              </mesh>
            );
          }
          case 'handle':
            return editable ? (
              <mesh
                key={`${widget}-${item.x}-${item.y}`}
                position={at(item.at, level)}
                rotation={[-Math.PI / 2, 0, 0]}
                userData={{ ...marks, widgetHandle: { widget, x: item.x, y: item.y, height: heightOf.get(level) ?? LIFT } satisfies HandleData }}
              >
                <circleGeometry args={[0.18, 24]} />
                <meshBasicMaterial color={color} side={THREE.DoubleSide} depthTest={false} />
                {/* Where it is on screen, for tests (the disc itself is drawn in WebGL) */}
                <Html center pointerEvents="none" style={{ pointerEvents: 'none' }}>
                  <span aria-hidden className="pointer-events-none block size-px" data-widget-handle-3d={`${item.x},${item.y}`} />
                </Html>
              </mesh>
            ) : null;
          default:
            return null;
        }
      })}
    </group>
  );
}

/**
 * Dragging handles: a press on a handle is ours (taken in the capture phase, so the orbit controls and the picker
 * never see it); the pointer then moves on the handle's floor plane, previewing the params, and releasing commits them.
 */
function useHandleDrag(editable: boolean, setOverrides: React.Dispatch<React.SetStateAction<ParamOverrides>>) {
  const { gl, camera, scene, raycaster, controls, invalidate } = useThree();
  const store = useEditorStore();
  const active = useRef<{ handle: HandleData; pointerId: number; last: Record<string, ParamValue> | null } | null>(null);
  useEffect(() => {
    if (!editable) return;
    const el = gl.domElement;
    const ray = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    };
    const orbit = controls as unknown as { enabled: boolean } | null;
    const setOverride = (widget: string, params: Record<string, ParamValue> | null) =>
      setOverrides(o => {
        const { [widget]: _old, ...rest } = o;
        return params ? { ...rest, [widget]: params } : rest;
      });
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || !e.isPrimary) return;
      ray(e);
      // Handles draw over everything (no depth test), so one under the pointer is pressed even with furniture in front of it
      const handle = raycaster.intersectObjects(scene.children, true).find(h => h.object.userData.widgetHandle)?.object.userData.widgetHandle as
        | HandleData
        | undefined;
      if (!handle) return;
      e.stopImmediatePropagation();
      el.setPointerCapture(e.pointerId);
      if (orbit) orbit.enabled = false;
      active.current = { handle, pointerId: e.pointerId, last: null };
    };
    const onMove = (e: PointerEvent) => {
      const a = active.current;
      if (!a || e.pointerId !== a.pointerId) return;
      e.stopImmediatePropagation();
      ray(e);
      const p = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -a.handle.height), new THREE.Vector3());
      if (!p) return;
      const next = { [a.handle.x]: snap(p.x / M), [a.handle.y]: snap(p.z / M) };
      if (JSON.stringify(next) === JSON.stringify(a.last)) return;
      a.last = next;
      setOverride(a.handle.widget, next);
      invalidate();
    };
    const end = async (e: PointerEvent) => {
      const a = active.current;
      if (!a || e.pointerId !== a.pointerId) return;
      e.stopImmediatePropagation();
      active.current = null;
      if (orbit) orbit.enabled = true;
      if (a.last) await store.getState().call('widget_configure', { widget: a.handle.widget, params: a.last });
      setOverride(a.handle.widget, null);
    };
    el.addEventListener('pointerdown', onDown, { capture: true });
    el.addEventListener('pointermove', onMove, { capture: true });
    el.addEventListener('pointerup', end, { capture: true });
    el.addEventListener('pointercancel', end, { capture: true });
    return () => {
      el.removeEventListener('pointerdown', onDown, { capture: true });
      el.removeEventListener('pointermove', onMove, { capture: true });
      el.removeEventListener('pointerup', end, { capture: true });
      el.removeEventListener('pointercancel', end, { capture: true });
      if (orbit) orbit.enabled = true;
    };
  }, [editable, gl, camera, scene, raycaster, controls, invalidate, store, setOverrides]);
}
