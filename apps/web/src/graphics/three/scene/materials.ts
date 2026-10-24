/** three.js materials from a material's style (lib/materials.ts): one place that turns a library material into a mesh material */
import * as THREE from 'three';
import type { MaterialStyle } from '@/lib/materials';

/** A standard material's settings for a style: see-through materials let light through and don't hide what is behind them */
export const standardMaterialProps = (s: MaterialStyle) => ({
  color: s.color,
  roughness: s.roughness,
  metalness: s.metalness,
  transparent: s.opacity < 1,
  opacity: s.opacity,
  depthWrite: s.opacity === 1,
});

export const standardMaterial = (s: MaterialStyle) => {
  const { color, ...rest } = standardMaterialProps(s);
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), ...rest });
};

/** Only opaque surfaces cast shadows: glass lets the sun through */
export const castsShadow = (s: MaterialStyle) => s.opacity === 1;
