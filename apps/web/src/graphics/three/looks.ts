/**
 * 3D geometry from recipes (see packages/core/src/looks/recipe.ts): each built part becomes a three.js geometry in metres, and the
 * parts are merged into one geometry per material (one draw call each). Recipes only name materials; what a material looks
 * like comes from its library (lookMaterial).
 */
import { getBuild, materialOf, type Built, type BuiltPart, type Material, type Recipe, type RecipeMaterial, type RecipeSize } from '@plinth/core';
import { materialStyle } from '@/lib/materials';
import { useRef } from 'react';
import { useBuildsVersion } from '@/lib/builds';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { M } from './scene';

/** How a material a recipe names is drawn: the recipe's own (its library's), the design's, or the default library's */
export const lookMaterial = (id: RecipeMaterial, recipe?: Recipe | null, design?: Record<string, Material>) => materialStyle(materialOf(id, recipe, design));

const DEG = Math.PI / 180;
const v3 = ([x, y, z]: [number, number, number]) => new THREE.Vector3(x * M, y * M, z * M);

/** Stand a cylinder's axis along x or z instead of y */
const toAxis = (g: THREE.BufferGeometry, axis: 'x' | 'y' | 'z') => (axis === 'x' ? g.rotateZ(Math.PI / 2) : axis === 'z' ? g.rotateX(Math.PI / 2) : g);

/** A three.js shape from a built 2D profile (mm → m); `flip` mirrors the second axis (plan profiles are drawn in x, z) */
function profileShape(profile: Extract<BuiltPart, { kind: 'extrude' }>['profile'], flip: boolean) {
  const s = new THREE.Shape(),
    k = flip ? -1 : 1;
  profile.forEach((it, i) => {
    if ('p' in it) {
      const [x, y] = it.p;
      if (i === 0) s.moveTo(x * M, k * y * M);
      else s.lineTo(x * M, k * y * M);
    } else if ('arc' in it) {
      const [cx, cy, r, a0, a1, cw] = it.arc;
      s.absarc(cx * M, k * cy * M, r * M, k * a0 * DEG, k * a1 * DEG, flip ? !cw : cw);
    } else {
      const [qx, qy, x, y] = it.curve;
      s.quadraticCurveTo(qx * M, k * qy * M, x * M, k * y * M);
    }
  });
  return s;
}

/** The geometry of one built part, in metres */
function partGeometry(p: Exclude<BuiltPart, { kind: 'base' }>): THREE.BufferGeometry {
  switch (p.kind) {
    case 'box': {
      const [w, h, d] = p.size.map(v => v * M);
      const g = p.r > 0 ? new RoundedBoxGeometry(w, h, d, 3, Math.max(0.0005, Math.min(p.r * M, w / 2, h / 2, d / 2) * 0.999)) : new THREE.BoxGeometry(w, h, d);
      if (p.rot[0]) g.rotateX(p.rot[0] * DEG);
      if (p.rot[1]) g.rotateY(p.rot[1] * DEG);
      if (p.rot[2]) g.rotateZ(p.rot[2] * DEG);
      return g.translate(p.at[0] * M, p.at[1] * M, p.at[2] * M);
    }
    case 'cylinder':
      return toAxis(new THREE.CylinderGeometry(p.r2 * M, p.r * M, p.h * M, p.seg).scale(...p.scale), p.axis).translate(p.at[0] * M, p.at[1] * M, p.at[2] * M);
    case 'sphere':
      return new THREE.IcosahedronGeometry(p.r * M, 3).scale(...p.scale).translate(p.at[0] * M, p.at[1] * M, p.at[2] * M);
    case 'lathe':
      return new THREE.LatheGeometry(
        p.profile.map(([r, y]) => new THREE.Vector2(r * M, y * M)),
        p.seg,
      )
        .scale(...p.scale)
        .translate(p.at[0] * M, p.at[1] * M, p.at[2] * M);
    case 'rod': {
      const a = v3(p.from),
        b = v3(p.to),
        dir = b.clone().sub(a);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      return new THREE.CylinderGeometry(p.r * M, p.r * M, dir.length(), p.seg).applyMatrix4(
        new THREE.Matrix4().compose(a.add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)),
      );
    }
    case 'ring': {
      const g = new THREE.TorusGeometry(p.R * M, p.r * M, 10, 32);
      if (p.axis === 'y') g.rotateX(Math.PI / 2);
      return g.translate(p.at[0] * M, p.at[1] * M, p.at[2] * M);
    }
    case 'tube':
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(p.points.map(v3)), Math.max(24, p.points.length * 12), p.r * M, 10);
    case 'panel': {
      const [ax, az] = p.from,
        [bx, bz] = p.to;
      return new THREE.BoxGeometry(Math.hypot(bx - ax, bz - az) * M, p.h * M, p.t * M)
        .rotateY(-Math.atan2(bz - az, bx - ax))
        .translate(((ax + bx) / 2) * M, (p.y + p.h / 2) * M, ((az + bz) / 2) * M);
    }
    case 'extrude': {
      const opts = { depth: p.depth * M, bevelEnabled: p.bevel > 0, bevelThickness: p.bevel * M, bevelSize: p.bevel * M, bevelSegments: 5, curveSegments: 10 };
      if (p.plane === 'side')
        return new THREE.ExtrudeGeometry(profileShape(p.profile, false), opts).translate(p.at[0] * M, p.at[1] * M, p.at[2] * M - (p.depth * M) / 2);
      // A plan profile (x, z) extruded upwards
      return new THREE.ExtrudeGeometry(profileShape(p.profile, true), opts).rotateX(-Math.PI / 2).translate(p.at[0] * M, p.at[1] * M, p.at[2] * M);
    }
  }
}

/** Merged geometry per material for built parts; `base` parts are left to the caller */
export function partsGeometry(parts: BuiltPart[]): [RecipeMaterial, THREE.BufferGeometry][] {
  const byMat = new Map<RecipeMaterial, THREE.BufferGeometry[]>();
  for (const p of parts) {
    if (p.kind === 'base') continue;
    const g = partGeometry(p);
    // The parts mix indexed and non-indexed geometries; merging needs the same attributes everywhere
    const flat = g.index ? g.toNonIndexed() : g;
    if (flat !== g) g.dispose();
    for (const name of Object.keys(flat.attributes)) if (!['position', 'normal', 'uv'].includes(name)) flat.deleteAttribute(name);
    flat.clearGroups();
    byMat.set(p.mat, [...(byMat.get(p.mat) ?? []), flat]);
  }
  return [...byMat].map(([mat, list]) => {
    const merged = mergeGeometries(list);
    for (const g of list) g.dispose();
    return [mat, merged];
  });
}

/**
 * What a recipe builds at a size with parameters: ready from the cache, or the last build this component showed while the new
 * one is under way; undefined before the first one, or when it doesn't build (a broken recipe never breaks the canvas)
 */
export function useBuild(recipe: Recipe | null | undefined, size: RecipeSize, params?: Record<string, unknown>): Built | undefined {
  useBuildsVersion();
  const last = useRef<Built | undefined>(undefined);
  const built = recipe ? getBuild(recipe, size, params) : undefined;
  if (built || !recipe) last.current = built;
  return last.current;
}
