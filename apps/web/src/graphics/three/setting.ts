/**
 * The setting a house stands in (issue 220): a tree line on the horizon all around, as architectural presentations place a house
 * in a landscape instead of on an empty plane. Image plants (plants.ts) far enough out that no view ever looks through them,
 * varied in species, height and spacing. It is scenery, not part of the design.
 */
import type { BuiltPart } from '@opensu/core';
import * as THREE from 'three';
import { plantGroup } from './plants';
import { M } from './scene';

const SPECIES = ['tree-small', 'tree-island', 'tree-searsia', 'tree-small', 'tree-island'];

/** How far the tree line stands from a house of this radius (metres) */
export const settingDistance = (radius: number) => Math.max(70, radius * 7);

/**
 * Aerial perspective: what lies beyond the house fades toward the horizon's colour, as distance reads in a photograph. The haze
 * starts just past the house as seen from the camera (`view`: the camera's distance to the house's centre), so the house itself
 * keeps its colours wherever the camera stands.
 */
export function hazeRange(view: number, radius: number): [number, number] {
  const near = view + radius * 1.5;
  return [near, near + settingDistance(radius) * 1.6];
}

/** A tree line around `center` (metres), beyond `radius`; resolves to a group to add to the scene */
export async function treeLine(center: THREE.Vector3, radius: number): Promise<THREE.Group> {
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  // Beyond the orbit's reach (CameraRig: 6 radii), with a minimum for small houses
  const r = settingDistance(radius);
  const parts: BuiltPart[] = [];
  // Three rows, the far ones taller, so the line reads as woodland rather than single trees
  for (const [row, spacing, lo, hi] of [
    [0, 5, 8, 13],
    [14, 6, 11, 17],
    [30, 7, 14, 22],
  ]) {
    const n = Math.round((2 * Math.PI * (r + row)) / spacing);
    for (let i = 0; i < n; i++) {
      const a = ((i + rnd() * 0.8) / n) * Math.PI * 2;
      const d = (r + row + rnd() * 8) / M;
      const h = (lo + rnd() * (hi - lo)) / M;
      parts.push({
        kind: 'plant',
        plant: SPECIES[Math.floor(rnd() * SPECIES.length)],
        at: [Math.cos(a) * d, 0, Math.sin(a) * d],
        h,
        w: h * (0.9 + rnd() * 0.6),
        d: h * (0.9 + rnd() * 0.6),
        rot: rnd() * 360,
        plan: false,
      });
    }
  }
  const g = (await plantGroup(parts)) ?? new THREE.Group();
  g.position.set(center.x, 0, center.z);
  // Far scenery: no shadows to cast into the house's shadow map, nothing to pick
  g.traverse(o => {
    o.castShadow = false;
    o.receiveShadow = false;
    o.raycast = () => {};
    o.userData.scenery = true;
  });
  return g;
}
