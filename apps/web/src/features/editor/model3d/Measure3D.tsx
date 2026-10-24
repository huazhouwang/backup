/**
 * The tape measure in 3D: a tap on a surface (without dragging) sets a point, the next one gives the straight distance between
 * them, as SketchUp's tape measure in 3D. Measurements stay until the tool is put away.
 */
import { Html, Line } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { useCanvasDocument } from '@/canvas/CanvasFrame';
import { themeColor } from '@/lib/theme';
import { useEditor } from '../store';

export function Measure3D() {
  const { gl, camera, scene, raycaster } = useThree();
  const measuring = useEditor(s => s.measuring);
  const doc = useCanvasDocument();
  const color = themeColor('--chart-2', doc);
  const [points, setPoints] = useState<THREE.Vector3[]>([]);
  useEffect(() => setPoints([]), [measuring]);
  useEffect(() => {
    if (!measuring) return;
    const el = gl.domElement;
    let down: { x: number; y: number; id: number } | null = null;
    const onDown = (e: PointerEvent) => {
      down = !down && e.button === 0 && e.isPrimary ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null;
    };
    const onUp = (e: PointerEvent) => {
      const d = down;
      down = null;
      if (!d || d.id !== e.pointerId || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;
      const r = el.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = raycaster.intersectObjects(scene.children, true).find(h => (h.object as THREE.Mesh).isMesh && !h.object.userData.measure);
      if (hit) setPoints(ps => [...ps, hit.point.clone()]);
    };
    const onCancel = () => {
      down = null;
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
    };
  }, [measuring, gl, camera, scene, raycaster]);
  if (!measuring) return null;
  const pairs = points.reduce<THREE.Vector3[][]>((out, p, i) => (i % 2 ? [...out.slice(0, -1), [out[out.length - 1][0], p]] : [...out, [p]]), []);
  return (
    <group>
      {points.map((p, i) => (
        <mesh key={i} position={p} userData={{ measure: true, noEdges: true }} renderOrder={10}>
          <sphereGeometry args={[0.05, 12, 8]} />
          <meshBasicMaterial color={color} depthTest={false} transparent />
        </mesh>
      ))}
      {pairs
        .filter(pair => pair.length === 2)
        .map(([a, b], i) => (
          <group key={i}>
            <Line points={[a, b]} color={color} lineWidth={2} depthTest={false} renderOrder={10} userData={{ measure: true, noEdges: true }} />
            <Html position={a.clone().add(b).multiplyScalar(0.5)} center zIndexRange={[20, 10]}>
              <div
                style={{
                  background: 'var(--background)',
                  color: 'var(--chart-2)',
                  border: '1px solid var(--chart-2)',
                  borderRadius: 6,
                  padding: '1px 6px',
                  font: '12px var(--font-mono)',
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                }}
              >
                {Math.round(a.distanceTo(b) * 1000)}
              </div>
            </Html>
          </group>
        ))}
    </group>
  );
}
