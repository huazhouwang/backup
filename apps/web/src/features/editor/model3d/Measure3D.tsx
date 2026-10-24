/**
 * The tape measure in 3D, as SketchUp's: a tap (or a click without dragging) sets the first point, then the tape follows the
 * pointer, inferring endpoints and the three axes (see measure-infer.ts): the line turns red, green or blue while it runs along
 * one, and Shift holds that axis. On a touch screen one finger drags the tape's end and lifting sets it (two fingers still pan
 * and zoom). The readout gives the length, and the horizontal run and the rise when it runs aslant. Measurements stay until the
 * tool is put away.
 */
import { Html, Line } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useCanvasDocument } from '@/canvas/CanvasFrame';
import { m } from '@/lib/i18n';
import { themeColor } from '@/lib/theme';
import { useEditor } from '../store';
import { infer, parts, type Axis, type Inferred } from './measure-infer';

const AXIS_VAR: Record<Axis, string> = { x: '--axis-x', y: '--axis-y', z: '--axis-z' };
const colorVar = (axis: Axis | null) => (axis ? AXIS_VAR[axis] : '--chart-2');

interface Tape {
  a: THREE.Vector3;
  b: THREE.Vector3;
  axis: Axis | null;
}

export function Measure3D() {
  const { gl, camera, scene, raycaster, invalidate } = useThree();
  const controls = useThree(s => s.controls) as OrbitControlsImpl | null;
  const measuring = useEditor(s => s.measuring);
  const doc = useCanvasDocument();
  const [tapes, setTapes] = useState<Tape[]>([]);
  const [from, setFrom] = useState<THREE.Vector3 | null>(null);
  const [preview, setPreview] = useState<Inferred | null>(null);
  const held = useRef<Axis | null>(null);
  useEffect(() => {
    setTapes([]);
    setFrom(null);
    setPreview(null);
  }, [measuring]);

  // While the tape's end is out on a touch screen, one finger draws it instead of orbiting
  useEffect(() => {
    if (!controls || !from) return;
    const touches = controls.touches;
    controls.touches = { ...touches, ONE: undefined };
    return () => {
      controls.touches = touches;
    };
  }, [controls, from]);

  useEffect(() => {
    if (!measuring) return;
    const el = gl.domElement;
    // The orbit controls capture the pointer while it is down, so its moves and lifts go to the document
    const doc3d = el.ownerDocument;
    const pointers = new Set<number>();
    let down: { x: number; y: number; id: number } | null = null;
    let drawing = false;
    const sense = (e: PointerEvent): Inferred | null => {
      const r = el.getBoundingClientRect();
      const pointer = new THREE.Vector2(e.clientX - r.left, e.clientY - r.top);
      const screen = (p: THREE.Vector3) => {
        const q = p.clone().project(camera);
        return new THREE.Vector2(((q.x + 1) / 2) * r.width, ((1 - q.y) / 2) * r.height);
      };
      raycaster.setFromCamera(new THREE.Vector2((pointer.x / r.width) * 2 - 1, -(pointer.y / r.height) * 2 + 1), camera);
      const h = raycaster.intersectObjects(scene.children, true).find(h => (h.object as THREE.Mesh).isMesh && !h.object.userData.measure);
      let hit: { point: THREE.Vector3; corners: THREE.Vector3[] } | null = null;
      if (h) {
        const position = (h.object as THREE.Mesh).geometry?.getAttribute('position');
        const corners =
          h.face && position && !(h.object as THREE.InstancedMesh).isInstancedMesh
            ? [h.face.a, h.face.b, h.face.c].map(i => new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(h.object.matrixWorld))
            : [];
        hit = { point: h.point, corners };
      }
      const start = fromRef.current;
      const result = infer({ ray: raycaster.ray, pointer, screen, hit, from: start, held: e.shiftKey ? held.current : null });
      // Shift holds the axis the tape last locked onto; letting go frees it
      held.current = e.shiftKey ? (result?.axis ?? held.current) : (result?.axis ?? null);
      return result;
    };
    const show = (p: Inferred | null) => {
      setPreview(p);
      invalidate();
    };
    const commit = (p: Inferred | null) => {
      if (!p) return;
      const start = fromRef.current;
      if (!start) {
        fromRef.current = p.point;
        setFrom(p.point);
      } else {
        setTapes(ts => [...ts, { a: start, b: p.point, axis: p.axis }]);
        fromRef.current = null;
        setFrom(null);
        held.current = null;
      }
      show(null);
    };
    const onDown = (e: PointerEvent) => {
      pointers.add(e.pointerId);
      if (pointers.size > 1) {
        // A second finger: pan and zoom, no tape
        down = null;
        drawing = false;
        show(null);
        return;
      }
      down = e.button === 0 && e.isPrimary ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null;
      drawing = !!down && e.pointerType !== 'mouse' && !!fromRef.current;
      if (drawing) show(sense(e));
    };
    const onMove = (e: PointerEvent) => {
      if (drawing && down?.id === e.pointerId) show(sense(e));
      else if (e.pointerType === 'mouse' && !down && e.target === el) show(fromRef.current || !e.buttons ? sense(e) : null);
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      const d = down;
      down = null;
      if (!d || d.id !== e.pointerId) return;
      if (drawing) {
        drawing = false;
        commit(sense(e));
      } else if (Math.hypot(e.clientX - d.x, e.clientY - d.y) <= 6) commit(sense(e));
    };
    const onCancel = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      down = null;
      drawing = false;
      show(null);
    };
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') show(null);
    };
    el.addEventListener('pointerdown', onDown);
    doc3d.addEventListener('pointermove', onMove);
    doc3d.addEventListener('pointerup', onUp);
    doc3d.addEventListener('pointercancel', onCancel);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      doc3d.removeEventListener('pointermove', onMove);
      doc3d.removeEventListener('pointerup', onUp);
      doc3d.removeEventListener('pointercancel', onCancel);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [measuring, gl, camera, scene, raycaster, invalidate]);
  // The pointer handlers read the first point without re-subscribing
  const fromRef = useRef<THREE.Vector3 | null>(null);
  useEffect(() => {
    fromRef.current = from;
  }, [from]);

  if (!measuring) return null;
  const live: Tape | null = from && preview ? { a: from, b: preview.point, axis: preview.axis } : null;
  return (
    <group>
      {tapes.map((t, i) => (
        <TapeLine key={i} tape={t} doc={doc} />
      ))}
      {live && <TapeLine tape={live} doc={doc} />}
      {from && <Dot at={from} color={themeColor('--chart-2', doc)} />}
      {preview && <Dot at={preview.point} color={themeColor(colorVar(preview.axis), doc)} large={preview.endpoint} />}
    </group>
  );
}

function Dot({ at, color, large }: { at: THREE.Vector3; color: string; large?: boolean }) {
  return (
    <mesh position={at} userData={{ measure: true, noEdges: true }} renderOrder={10}>
      <sphereGeometry args={[large ? 0.07 : 0.045, 12, 8]} />
      <meshBasicMaterial color={color} depthTest={false} transparent />
    </mesh>
  );
}

function TapeLine({ tape: { a, b, axis }, doc }: { tape: Tape; doc: Document }) {
  const { length, run, rise } = parts(a, b);
  const v = colorVar(axis);
  return (
    <group>
      <Dot at={a} color={themeColor(v, doc)} />
      <Dot at={b} color={themeColor(v, doc)} />
      <Line points={[a, b]} color={themeColor(v, doc)} lineWidth={2} depthTest={false} renderOrder={10} userData={{ measure: true, noEdges: true }} />
      {/* The label never takes the pointer, so a click on it still lands on the model */}
      <Html position={a.clone().add(b).multiplyScalar(0.5)} center zIndexRange={[20, 10]} pointerEvents="none">
        <div
          data-measure={length}
          style={{
            background: 'var(--background)',
            color: `var(${v})`,
            border: `1px solid var(${v})`,
            borderRadius: 6,
            padding: '1px 6px',
            font: '12px var(--font-mono)',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            textAlign: 'center',
          }}
        >
          <div>{length}</div>
          {run > 0 && rise > 0 && <div style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{m.measure_parts({ run, rise })}</div>}
        </div>
      </Html>
    </group>
  );
}
