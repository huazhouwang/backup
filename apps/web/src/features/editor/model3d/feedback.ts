/**
 * How an object in the 3D view answers selection and changes, as SketchUp: selected, its surfaces are stippled with dots in the
 * selection colour over their own colours, with thin edges (see meshes.tsx); under the mouse, thin edges; after a change, a tint
 * that fades out and a hop (see canvas/hop.ts)
 */
import { useFrame } from '@react-three/fiber';
import { createContext, useContext, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { hops } from '@/canvas/hop';

const CHANGED_TINT = 0.6;
/** The selection colour, as a color and as a CSS string for outlines, and the change tint */
export const TintColors = createContext<{ sel: THREE.Color; selCss: string; changed: THREE.Color }>({
  sel: new THREE.Color(),
  selCss: '',
  changed: new THREE.Color(),
});

/**
 * Per-frame feedback for one object (see canvas/hop.ts): the dots over it while selected, its color fading after a change, and the
 * one-time hop.
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
      stipple(part as THREE.Mesh, selected, tints.sel);
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

/**
 * SketchUp's selected faces: a grid of dots on screen in the selection colour, every few pixels, over the surface's own colour. A
 * copy of the part's geometry drawn just in front of it, discarding all but the dots.
 */
const DOT_SPACING = 3;
const stippleMaterial = new THREE.ShaderMaterial({
  uniforms: { color: { value: new THREE.Color() }, spacing: { value: DOT_SPACING }, dot: { value: 1 } },
  vertexShader: `void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform vec3 color;
    uniform float spacing;
    uniform float dot;
    void main() {
      vec2 cell = floor(gl_FragCoord.xy / spacing);
      // Every other row shifted by half a cell, as SketchUp's stipple
      vec2 p = mod(gl_FragCoord.xy + vec2(mod(cell.y, 2.0) * spacing * 0.5, 0.0), spacing);
      if (p.x >= dot || p.y >= dot) discard;
      gl_FragColor = vec4(color, 1.0);
    }
  `,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
  side: THREE.DoubleSide,
});

function stipple(part: THREE.Mesh, on: boolean, color: THREE.Color) {
  let dots = part.userData.dots as THREE.Mesh | undefined;
  if (!on && !dots) return;
  if (!dots) {
    dots = new THREE.Mesh(part.geometry, stippleMaterial);
    dots.raycast = () => {};
    dots.userData = { mark: true, noEdges: true };
    dots.renderOrder = 1;
    part.add(dots);
    part.userData.dots = dots;
  }
  if (dots.geometry !== part.geometry) dots.geometry = part.geometry;
  stippleMaterial.uniforms.color.value.copy(color);
  // In screen pixels whatever the pixel ratio
  const dpr = globalThis.devicePixelRatio || 1;
  stippleMaterial.uniforms.spacing.value = DOT_SPACING * dpr;
  stippleMaterial.uniforms.dot.value = Math.max(1, Math.round(dpr));
  dots.visible = on;
}
