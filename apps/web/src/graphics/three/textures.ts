/**
 * Texture sets on 3D surfaces (issue 210): a material naming a set (`extras.texture`, see textures.ts in @opensu/core) is drawn
 * with the set's photographed maps, laid at the set's real size by box projection, and tinted so the surface averages to the
 * material's colour (the colour the plan and the swatches show). Images load once and are shared; every material gets its own
 * repeat on the shared image. The light setup takes the colour map only.
 */
import { textureOf, textureSize, type Material } from '@opensu/core';
import { createContext, useContext, useEffect, useState } from 'react';
import * as THREE from 'three';
import { M } from './scene';

/** The catalog's images, as URLs Vite serves and fingerprints */
const URLS = import.meta.glob('../../../../../libraries/textures/*/*.webp', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const urlOf = (path: string) => URLS[`../../../../../libraries/textures/${path}`];

export interface SurfaceMaps {
  map: THREE.Texture;
  normalMap?: THREE.Texture;
  /** Ambient occlusion, roughness and metalness in R, G, B: the material's roughnessMap and aoMap */
  arm?: THREE.Texture;
  /** The colour the maps are multiplied by, linear: the material's colour over the set's average (may exceed 1) */
  tint: THREE.Color;
}

const images = new Map<string, Promise<THREE.Texture>>();
/** An image of the catalog, loaded once (`color`: in sRGB; the other maps are data) */
function image(path: string, color: boolean) {
  let t = images.get(path);
  if (!t) {
    t = new THREE.TextureLoader().loadAsync(urlOf(path)).then(tex => {
      tex.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = 8;
      return tex;
    });
    images.set(path, t);
  }
  return t;
}

/** A shared image repeated every `size` mm: a copy of the texture over the same source, so the image uploads once */
const repeated = (tex: THREE.Texture, [w, h]: [number, number]) => {
  const t = tex.clone();
  t.repeat.set(1 / (w * M), 1 / (h * M));
  return t;
};

const maps = new WeakMap<Material, Map<string, Promise<SurfaceMaps>>>();

/** The maps of a material with a texture set (null without one); `lite` takes the colour map only */
export function surfaceMaps(m: Material | undefined, lite = false): Promise<SurfaceMaps> | null {
  const set = textureOf(m);
  if (!m || !set) return null;
  let byMode = maps.get(m);
  if (!byMode) maps.set(m, (byMode = new Map()));
  const key = lite ? 'lite' : 'full';
  let p = byMode.get(key);
  if (!p) {
    const size = textureSize(m, set);
    const [r, g, b] = m.pbrMetallicRoughness.baseColorFactor;
    const tint = new THREE.Color().setRGB(r / set.average[0], g / set.average[1], b / set.average[2], THREE.LinearSRGBColorSpace);
    p = Promise.all([
      image(set.maps.color, true),
      !lite && set.maps.normal ? image(set.maps.normal, false) : null,
      !lite && set.maps.arm ? image(set.maps.arm, false) : null,
    ]).then(([color, normal, arm]) => ({
      map: repeated(color, size),
      normalMap: normal ? repeated(normal, size) : undefined,
      arm: arm ? repeated(arm, size) : undefined,
      tint,
    }));
    byMode.set(key, p);
  }
  return p;
}

/** Whether the 3D view draws in its light setup: texture sets bring their colour map only */
export const LiteSurfaces = createContext(false);

/** The maps of a material once loaded; null until then, or for a material without a texture set */
export function useSurfaceMaps(m: Material | undefined) {
  const lite = useContext(LiteSurfaces);
  const [got, setGot] = useState<SurfaceMaps | null>(null);
  useEffect(() => {
    const p = surfaceMaps(m, lite);
    if (!p) return setGot(null);
    let live = true;
    void p.then(s => live && setGot(s));
    return () => void (live = false);
  }, [m, lite]);
  return got;
}

/** The properties a MeshStandardMaterial takes for the maps (roughness and AO from the ARM map, as glTF packs them) */
export const mapProps = (s: SurfaceMaps) => ({
  map: s.map,
  normalMap: s.normalMap ?? null,
  roughnessMap: s.arm ?? null,
  aoMap: s.arm ?? null,
});

/** Puts the maps on a material (stills and previews, built outside React) */
export function applyMaps(material: THREE.MeshStandardMaterial, s: SurfaceMaps) {
  Object.assign(material, mapProps(s));
  material.color.copy(s.tint);
  material.needsUpdate = true;
}

/**
 * Texture coordinates in metres by box projection, as SketchUp and Blender lay a material on any shape: each triangle takes the
 * plane its face turns to most (sides: along and up; tops and bottoms: the plan). Replaces the geometry's own coordinates; the
 * geometry must be non-indexed so each triangle owns its corners.
 */
export function boxUV(g: THREE.BufferGeometry) {
  const pos = g.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3(),
    n = new THREE.Vector3();
  for (let i = 0; i + 2 < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    n.subVectors(c, b).cross(a.clone().sub(b));
    const [x, y, z] = [Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)];
    for (let k = 0; k < 3; k++) {
      const v = [a, b, c][k];
      const [u, w] = y >= x && y >= z ? [v.x, v.z] : x >= z ? [v.z, v.y] : [v.x, v.y];
      uv[(i + k) * 2] = u;
      uv[(i + k) * 2 + 1] = w;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
