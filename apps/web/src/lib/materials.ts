/**
 * Library materials (glTF 2.0, see packages/core/src/looks/material.ts) for drawing: CSS colours for the plan, swatches and
 * three.js. Material colours are data from a library, not theme colours: the canvas draws what the library says.
 */
import type { Material, RGBA } from '@plinth/core';

/** sRGB 0..255 of a linear 0..1 channel */
const encode = (c: number) => Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));

/** A linear glTF colour as a CSS colour (alpha left out) */
export const cssColor = (c: RGBA) => `rgb(${encode(c[0])}, ${encode(c[1])}, ${encode(c[2])})`;

/** What a material looks like to the renderer; a missing material is a neutral grey */
export interface MaterialStyle {
  color: string;
  roughness: number;
  metalness: number;
  /** Below 1 for see-through materials (glass), which also cast no shadow */
  opacity: number;
}

const MISSING: RGBA = [0.6, 0.6, 0.6, 1];

export function materialStyle(m: Material | undefined): MaterialStyle {
  const pbr = m?.pbrMetallicRoughness,
    c = pbr?.baseColorFactor ?? MISSING;
  return {
    color: cssColor(c),
    roughness: pbr?.roughnessFactor ?? 0.9,
    metalness: pbr?.metallicFactor ?? 0,
    opacity: m?.alphaMode === 'BLEND' ? c[3] : 1,
  };
}
