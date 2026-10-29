/**
 * Image plants in 3D (issue 214): a plant of the catalog (plants.ts in @opensu/core) as two crossed cut-outs, the view from the
 * front and the view from the side, the way SketchUp's face-me plants and Enscape's billboards stand in a scene. The cut-outs are
 * alpha-tested, so leaves cast leaf-shaped shadows through the depth material; they draw no profiles. Images load once and are
 * shared.
 */
import { PLANTS, type BuiltPart } from '@opensu/core';
import * as THREE from 'three';
import { M } from './scene';

/** The catalog's images, as URLs Vite serves and fingerprints */
const URLS = import.meta.glob('../../../../../libraries/plants/*/*.webp', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
export const plantImageUrl = (path: string) => URLS[`../../../../../libraries/plants/${path}`];

const ALPHA_TEST = 0.5;
const DEG = Math.PI / 180;

const images = new Map<string, Promise<THREE.Texture>>();
function image(path: string) {
  let t = images.get(path);
  if (!t) {
    t = new THREE.TextureLoader().loadAsync(plantImageUrl(path)).then(tex => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      return tex;
    });
    images.set(path, t);
  }
  return t;
}

const materials = new Map<THREE.Texture, { color: THREE.MeshStandardMaterial; depth: THREE.MeshDepthMaterial }>();
/** A cut-out's materials, shared by every plant drawn with the same image */
function cutout(tex: THREE.Texture) {
  let m = materials.get(tex);
  if (!m) {
    m = {
      color: new THREE.MeshStandardMaterial({ map: tex, alphaTest: ALPHA_TEST, side: THREE.DoubleSide, roughness: 0.85, metalness: 0 }),
      depth: new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: ALPHA_TEST }),
    };
    materials.set(tex, m);
  }
  return m;
}

type PlantPart = Extract<BuiltPart, { kind: 'plant' }>;

/** A built look's image plants as one group in metres, in the look's frame; null when it has none */
export async function plantGroup(parts: BuiltPart[]): Promise<THREE.Group | null> {
  const plants = parts.filter((p): p is PlantPart => p.kind === 'plant' && !!PLANTS[p.plant]);
  if (!plants.length) return null;
  const g = new THREE.Group();
  for (const p of plants) {
    const plant = PLANTS[p.plant];
    const { w, d } = p;
    const [front, side] = await Promise.all([image(plant.views.front), image(plant.views.side)]);
    const one = new THREE.Group();
    // The front view faces south (+z), across the plant's width; the side view faces east (+x), across its depth
    for (const [tex, width, turn] of [
      [front, w, 0],
      [side, d, Math.PI / 2],
    ] as const) {
      const m = cutout(tex);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width * M, p.h * M).translate(0, (p.h * M) / 2, 0).rotateY(turn), m.color);
      mesh.customDepthMaterial = m.depth;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // Leaves have no edges worth drawing: the profiles pass leaves them out
      mesh.userData.noEdges = true;
      mesh.userData.plant = true;
      one.add(mesh);
    }
    one.position.set(p.at[0] * M, p.at[1] * M, p.at[2] * M);
    one.rotation.y = -p.rot * DEG;
    g.add(one);
  }
  return g;
}

/** Frees a plant group's geometry (images and materials stay shared) */
export function disposePlants(g: THREE.Group | null) {
  g?.traverse(o => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.dispose());
}
