/**
 * A whole house as a three.js scene, offscreen: the same model as the editor's 3D view, built from the same scene layer (./scene):
 * walls in their finish, floors in their material, roofs over rooms with nothing above, doors, windows, railings and furniture
 * drawn by their looks, elements, standing on the ground under the same sky, with its sun, in the canvas's light theme. Shared by
 * the house stills on the design list (house-still.ts) and the passes style renders start from (render-passes.ts). Every mesh
 * records what part of the building it is (`userData.part`), for the mask pass.
 */
import {
  footing,
  furnitureTarget,
  lookRecipe,
  openingFrames,
  openingTarget,
  projectBoxes,
  projectElements,
  requestBuild,
  buildError,
  materialOf,
  textureOf,
  type Material,
  roofs,
  SLAB_THICKNESS,
  wallTarget,
  type Project,
  type Recipe,
  type RecipeSize,
  slabShape,
} from '@opensu/core';
import * as THREE from 'three';
import { materialStyle } from '@/lib/materials';
import { themeColor } from '@/lib/theme';
import { modelStyle } from '../model-style';
import { materialPattern } from '../plan/floor-materials';
import { floorTexture } from './floor-textures';
import { isSoftwareGL, LOOK, type Look } from './beauty';
import { partsGeometry } from './looks';
import { applyMaps, surfaceMaps } from './textures';
import {
  backdrop,
  DEFAULT_SUN,
  SKYLIGHT_WITHOUT_ENVIRONMENT,
  skyEnvironment,
  castsShadow,
  elementLook,
  floorMaterial,
  hasSlab,
  houseBox,
  M,
  railingPieces,
  shadowGround,
  slabGeometry,
  slabLevel,
  solidFallbackColor,
  solidGeometry,
  solidMaterial,
  standardMaterial,
  sunLight,
  wallFinish,
  wallGeometry,
  wallMaterial,
} from './scene';

/** What a mesh is part of */
export type HousePart = 'wall' | 'floor' | 'roof' | 'window' | 'door' | 'furniture' | 'railing' | 'element';

export interface HouseScene {
  scene: THREE.Scene;
  house: THREE.Group;
  /** The site's ground, which only catches shadows */
  ground: THREE.Mesh;
  sun: THREE.DirectionalLight;
  /** Walls and floors of every level, in metres */
  box: THREE.Box3;
  center: THREE.Vector3;
  radius: number;
  dispose(): void;
}

/** `renderer`: light the scene with the sky environment too (it is prefiltered on that renderer); `look`: other light values */
export async function houseScene(p: Project, doc: Document, opts: { renderer?: THREE.WebGLRenderer; look?: Look } = {}): Promise<HouseScene> {
  const light = opts.look ?? LOOK;
  const color = (t: string) => new THREE.Color(themeColor(t, doc));
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, material: THREE.Material, part: HousePart) => {
    const mesh = new THREE.Mesh(keep(geo), keep(material));
    mesh.userData.part = part;
    parent.add(mesh);
    return mesh;
  };
  const house = new THREE.Group();
  const elev = new Map(p.levels.map(l => [l.id, l.elevation]));
  const white = themeColor('--card', doc);
  const plain = (c: string, roughness: number) => ({ ...materialStyle(undefined), color: c, roughness });
  // The renderer the full setup is affordable on (the sky environment, every map of a texture set), if any
  const lit = opts.renderer && !isSoftwareGL(opts.renderer.getContext()) ? opts.renderer : null;
  const jobs: Promise<void>[] = [];
  // A material's texture set on a mesh's material, once loaded (see textures.ts)
  const textured = (material: THREE.MeshStandardMaterial, m: Material | undefined) => {
    const maps = surfaceMaps(m, !lit);
    if (maps) jobs.push(maps.then(s => applyMaps(material, s)));
  };

  // A look built at a size, as meshes in its materials
  const look = async (recipe: Recipe | null, size: RecipeSize, part: HousePart, params?: Record<string, unknown>) => {
    const g = new THREE.Group();
    let built = recipe && (await requestBuild(recipe, size, params));
    // A build that ran out of time (the page was busy) is left unbuilt, not failed: ask once more rather than leave it out
    if (recipe && !built && !buildError(recipe, size, params)) built = await requestBuild(recipe, size, params);
    if (!built) return g;
    for (const [mat, geo] of partsGeometry(built.parts)) {
      const m = materialOf(mat, recipe, p.library.materials);
      const style = materialStyle(m);
      const mesh = add(g, geo, standardMaterial(style), part);
      const maps = surfaceMaps(m, !lit);
      if (maps) applyMaps(mesh.material as THREE.MeshStandardMaterial, await maps);
      mesh.castShadow = castsShadow(style);
      mesh.receiveShadow = true;
    }
    return g;
  };
  // Where a built look goes: a point in millimetres and a turn about the vertical
  const place = (g: THREE.Group, [x, y, z]: [number, number, number], angle = 0) => {
    g.position.set(x * M, y * M, z * M);
    g.rotation.y = -angle;
    house.add(g);
  };

  // Floors, in their material (its texture set, else its pattern, else its colour)
  for (const s of p.spaces) {
    if (!hasSlab(s)) continue;
    const { y, thickness } = slabLevel(s, elev.get(s.level) ?? 0, p.site.groundLevel);
    const m = floorMaterial(p, s.floor);
    const material = standardMaterial(m ? materialStyle(m) : plain(white, 1));
    if (textureOf(m)) textured(material, m);
    else if (m && materialPattern(m)) {
      material.color.set(white);
      material.map = await floorTexture(doc, m);
    }
    const mesh = add(house, slabGeometry(slabShape(p, s), thickness), material, 'floor');
    mesh.position.y = (y + 2 - thickness) * M;
    mesh.receiveShadow = true;
  }

  // Roofs over rooms with nothing above them
  for (const r of roofs(p)) {
    const mesh = add(house, slabGeometry(r.shape, SLAB_THICKNESS), standardMaterial(plain(white, 0.9)), 'roof');
    mesh.position.y = ((elev.get(r.level) ?? 0) + r.top + 2 - SLAB_THICKNESS) * M;
    mesh.castShadow = mesh.receiveShadow = true;
  }

  // Walls in their finish, one solid each (glass is drawn by the openings' looks); railings by their look, piece by piece
  for (const w of p.walls) {
    const base = elev.get(w.level) ?? 0;
    if (w.kind === 'railing') {
      const recipe = lookRecipe(p, wallTarget(w), w.look);
      for (const b of railingPieces(p, w))
        jobs.push(
          look(recipe, { w: b.length, d: b.thickness, h: b.height }, 'railing', w.lookParams).then(g =>
            place(g, [b.center[0], base + b.z, b.center[1]], b.angle),
          ),
        );
      continue;
    }
    const material = standardMaterial(wallFinish(p, w));
    textured(material, wallMaterial(p, w));
    const mesh = add(house, wallGeometry(p, w, footing(base, p.site.groundLevel)), material, 'wall');
    mesh.position.set(w.start[0] * M, base * M, w.start[1] * M);
    mesh.castShadow = mesh.receiveShadow = true;
  }

  // Doors and windows
  for (const fr of openingFrames(p)) {
    const size = { w: fr.width, d: fr.thickness, h: fr.height };
    const part = fr.opening.kind === 'window' ? 'window' : 'door';
    jobs.push(
      look(lookRecipe(p, openingTarget(fr.opening), fr.opening.look), size, part, fr.opening.lookParams).then(g =>
        place(g, [fr.center[0], (elev.get(fr.level) ?? 0) + fr.z, fr.center[1]], fr.angle),
      ),
    );
  }

  // Elements' own geometry, in the materials their look gives each kind of solid
  for (const s of projectElements(p).flatMap(g => g.solids)) {
    const e = p.elements.find(x => x.id === s.id);
    const lk = e && elementLook(p, e);
    const built = lk?.recipe ? ((await requestBuild(lk.recipe, lk.size, lk.params)) ?? undefined) : undefined;
    const style = (e && solidMaterial(p, built, s, e)) ?? plain(themeColor(solidFallbackColor(s), doc), 0.9);
    const mesh = add(house, solidGeometry(s), standardMaterial(style), 'element');
    mesh.position.y = ((elev.get(s.level) ?? 0) + s.z) * M;
    mesh.castShadow = s.kind === 'structure';
    mesh.receiveShadow = true;
  }

  // Furniture
  for (const f of p.furniture) {
    jobs.push(
      look(lookRecipe(p, furnitureTarget(f), f.look), f.size, 'furniture', f.lookParams).then(g =>
        place(g, [f.position[0], (elev.get(f.level) ?? 0) + (f.elevation ?? 0), f.position[1]], (f.rotation * Math.PI) / 180),
      ),
    );
  }
  await Promise.all(jobs);

  const scene = new THREE.Scene();
  // The 3D view's background: sky and ground split at the horizon (see backdrop)
  const bg = backdrop(modelStyle(), {
    backdrop: themeColor('--canvas-backdrop', doc),
    sky: themeColor('--canvas-sky', doc),
    horizon: themeColor('--canvas-backdrop', doc),
    ground: themeColor('--canvas-ground', doc),
  });
  scene.background = bg instanceof THREE.Texture ? keep(bg) : bg;
  scene.add(house);
  const box = houseBox(p, projectBoxes(p), new Set(p.levels.map(l => l.id)));
  const center = box.getCenter(new THREE.Vector3()),
    radius = Math.max(2, box.getSize(new THREE.Vector3()).length() / 2);

  // The house stands on the site's ground, which only catches shadows
  const ground = shadowGround(color('--canvas-shadow'), radius * 40);
  keep(ground.geometry);
  keep(ground.material);
  ground.position.set(center.x, p.site.groundLevel * M - 0.001, center.z);
  scene.add(ground);

  // The 3D view's light, with the sky environment where the renderer can afford it; elsewhere the sky light carries it all
  scene.add(new THREE.HemisphereLight(color('--canvas-skylight'), white, lit ? light.sky : SKYLIGHT_WITHOUT_ENVIRONMENT));
  const sun = sunLight(color('--canvas-sun'), center, radius);
  sun.intensity = light.sun;
  scene.add(sun, sun.target);
  // The sky as image-based light (issue 208)
  const env =
    lit &&
    skyEnvironment(
      lit,
      {
        sky: themeColor('--canvas-sky', doc),
        horizon: themeColor('--canvas-backdrop', doc),
        ground: themeColor('--canvas-ground', doc),
        sun: themeColor('--canvas-sun', doc),
      },
      DEFAULT_SUN,
    );
  if (env) {
    scene.environment = keep(env);
    scene.environmentIntensity = light.environment;
  }

  return {
    scene,
    house,
    ground,
    sun,
    box,
    center,
    radius,
    dispose: () => {
      disposables.forEach(d => d.dispose());
      sun.shadow.map?.dispose();
    },
  };
}
