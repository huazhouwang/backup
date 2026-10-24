/**
 * Floor material textures for the 3D floors: each material's pattern tile (see floor-materials.tsx) rasterized once per canvas
 * document and repeated by world position (floor UVs are in metres), so a floor in 3D shows the same pattern as in the plan.
 */
import type { Material } from '@plinth/core';
import { createElement, useEffect, useState } from 'react';
import * as THREE from 'three';
import { materialPattern } from '../plan/floor-materials';
import { markup } from '../plan/markup';
import { M } from './scene';

/** Pixels per millimetre of a tile: about 4 mm per pixel, enough for seams and grout at viewing distance */
const PX_PER_MM = 0.25;
const cache = new WeakMap<Document, WeakMap<Material, Promise<THREE.Texture>>>();

/** A floor material's pattern as a texture repeated per metre, made once per document (the material must have a pattern) */
export function floorTexture(doc: Document, material: Material) {
  let m = cache.get(doc);
  if (!m) cache.set(doc, (m = new WeakMap()));
  let t = m.get(material);
  if (!t) {
    const p = materialPattern(material)!;
    const w = Math.max(64, Math.min(512, Math.round(p.w * PX_PER_MM))),
      h = Math.max(64, Math.min(512, Math.round(p.h * PX_PER_MM)));
    const svg = markup(createElement('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 0 ${p.w} ${p.h}`, width: w, height: h }, p.tile), doc);
    t = (async () => {
      const img = new doc.defaultView!.Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await img.decode();
      const c = doc.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d')!.drawImage(img, 0, 0, w, h);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(1 / (p.w * M), 1 / (p.h * M));
      tex.anisotropy = 8;
      return tex;
    })();
    m.set(material, t);
  }
  return t;
}

/** The texture for a floor material (`id` keys it), once ready; null for a material without a pattern */
export function useFloorTexture(doc: Document, id: string, material: Material | undefined) {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!material || !materialPattern(material)) return setTex(null);
    let live = true;
    void floorTexture(doc, material).then(t => live && setTex(t));
    return () => void (live = false);
  }, [doc, id, material]);
  return tex;
}
