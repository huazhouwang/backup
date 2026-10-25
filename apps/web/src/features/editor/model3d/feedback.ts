/** How an object in the 3D view answers selection and changes: an outline when selected (see meshes.tsx), a tint and a hop (see canvas/hop.ts) after a change */
import { useFrame } from '@react-three/fiber';
import { createContext, useContext, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { hops } from '@/canvas/hop';

/** Selected objects keep their colors (only outlined); just-changed objects get a tint that fades out */
const CHANGED_TINT = 0.6;
export const TintColors = createContext<{ changed: THREE.Color }>({ changed: new THREE.Color() });

/**
 * Per-frame feedback for one object (see canvas/hop.ts): its color (fading after a change, unless selected) and the one-time hop.
 * userData.restY and userData.baseColor record the resting state; screenshots put objects back to it first.
 */
export function useFeedback<T extends THREE.Object3D>(id: string, color: string | null, selected: boolean) {
  const ref = useRef<T>(null);
  const tints = useContext(TintColors);
  const base = useMemo(() => color && new THREE.Color(color), [color]);
  useFrame(({ camera, size, invalidate }) => {
    const o = ref.current;
    if (!o) return;
    const now = performance.now();
    // A mesh in its color, or a group (a furniture model) whose parts carry their own colors in userData.baseColor
    if (base) o.userData.baseColor = base;
    const k = selected ? 0 : hops.changeTint(id, now);
    if (k > 0) invalidate();
    o.traverse(part => {
      if (!(part as THREE.Mesh).isMesh || !part.userData.baseColor) return;
      const mat = (part as THREE.Mesh).material as THREE.MeshStandardMaterial;
      mat.color.copy(part.userData.baseColor);
      if (k > 0) mat.color.lerp(tints.changed, CHANGED_TINT * k);
    });
    const px = hops.lift(id, now);
    o.position.y = o.userData.restY;
    if (!px) return;
    invalidate();
    // Hop height is in screen pixels: the farther from the camera, the higher the lift
    const dist = camera.position.distanceTo(o.getWorldPosition(tmp));
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 40;
    o.position.y += (px * 2 * dist * Math.tan((fov * Math.PI) / 360)) / size.height;
  });
  return ref;
}
const tmp = new THREE.Vector3();
