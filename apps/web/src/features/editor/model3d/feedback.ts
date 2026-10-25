/**
 * How an object in the 3D view answers selection and changes, as Revit: selected, it turns semi-transparent in the selection colour
 * (things behind it show through) with its edges outlined, and under the mouse its edges are outlined (see meshes.tsx); after a
 * change, a tint that fades out and a hop (see canvas/hop.ts)
 */
import { useFrame } from '@react-three/fiber';
import { createContext, useContext, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { hops } from '@/canvas/hop';

const SELECTED_TINT = 0.85;
/** How opaque a selected object is (Revit's "semi-transparent" selection) */
const SELECTED_OPACITY = 0.65;
/** How much a selected object glows in the selection colour */
const SELECTED_GLOW = 0.6;
const CHANGED_TINT = 0.6;
/** The selection colour, as a color and as a CSS string for outlines, and the change tint */
export const TintColors = createContext<{ sel: THREE.Color; selCss: string; changed: THREE.Color }>({
  sel: new THREE.Color(),
  selCss: '',
  changed: new THREE.Color(),
});

/**
 * Per-frame feedback for one object (see canvas/hop.ts): its color and opacity (selected, or fading after a change) and the one-time hop.
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
      if (selected) mat.color.lerp(tints.sel, SELECTED_TINT);
      else if (k > 0) mat.color.lerp(tints.changed, CHANGED_TINT * k);
      // The bright white-model lighting would wash a tint out to white: the selection glows in its colour too
      part.userData.baseEmissive ??= mat.emissive.clone();
      if (selected) mat.emissive.copy(tints.sel).multiplyScalar(SELECTED_GLOW);
      else mat.emissive.copy(part.userData.baseEmissive);
      seeThrough(part, mat, selected);
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

/** A selected part lets what is behind it show through; deselected, it is back to its own opacity */
function seeThrough(part: THREE.Object3D, mat: THREE.MeshStandardMaterial, on: boolean) {
  const u = part.userData;
  if (u.baseOpacity === undefined) {
    u.baseOpacity = mat.opacity;
    u.baseTransparent = mat.transparent;
  }
  // All selected parts alike, glass too (clear glass would hardly show the selection)
  const opacity = on ? SELECTED_OPACITY : u.baseOpacity;
  const transparent = on || u.baseTransparent;
  if (mat.opacity === opacity && mat.transparent === transparent) return;
  mat.opacity = opacity;
  if (mat.transparent !== transparent) {
    mat.transparent = transparent;
    mat.needsUpdate = true;
  }
}
