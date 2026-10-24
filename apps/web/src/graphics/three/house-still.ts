/**
 * A still of a whole house in 3D, for the design list: the same model as the editor's 3D view, built from the same scene layer
 * (./scene): walls in their finish, floors in their material, doors, windows, railings and furniture drawn by their looks,
 * elements, standing on the ground under the same sky, seen from the 3D view's default direction, with its sun and shadows, in
 * the canvas's light theme. Drawn offscreen on the one renderer the look stills share (look-preview.ts), as a JPEG data URL.
 */
import {
  furnitureTarget,
  lookRecipe,
  openingFrames,
  openingTarget,
  projectBoxes,
  projectElements,
  requestBuild,
  wallTarget,
  type Project,
  type Recipe,
  type RecipeSize,
} from '@plinth/core';
import * as THREE from 'three';
import { lightDocument } from '@/canvas/CanvasFrame';
import { materialStyle } from '@/lib/materials';
import { themeColor } from '@/lib/theme';
import { modelStyle } from '../model-style';
import { materialPattern } from '../plan/floor-materials';
import { floorTexture } from './floor-textures';
import { BIRD, FOV, framed } from './framing';
import { withStillRenderer } from './look-preview';
import { lookMaterial, partsGeometry } from './looks';
import {
  castsShadow,
  elementLook,
  floorMaterial,
  hasSlab,
  houseBox,
  M,
  footing,
  railingPieces,
  shadowGround,
  SKYLIGHT_INTENSITY,
  skyTexture,
  slabGeometry,
  slabLevel,
  solidFallbackColor,
  solidGeometry,
  solidMaterial,
  standardMaterial,
  sunLight,
  wallFinish,
  wallGeometry,
} from './scene';

export function renderHouseStill(project: Project, opts: { width?: number; height?: number } = {}): Promise<string> {
  return withStillRenderer(r => draw(r, project, opts.width ?? 640, opts.height ?? 480));
}

async function draw(renderer: THREE.WebGLRenderer, p: Project, W: number, H: number): Promise<string> {
  const doc = await lightDocument();
  const color = (t: string) => new THREE.Color(themeColor(t, doc));
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, material: THREE.Material) => {
    const mesh = new THREE.Mesh(keep(geo), keep(material));
    parent.add(mesh);
    return mesh;
  };
  const house = new THREE.Group();
  const elev = new Map(p.levels.map(l => [l.id, l.elevation]));
  const white = themeColor('--card', doc);
  const plain = (c: string, roughness: number) => ({ ...materialStyle(undefined), color: c, roughness });

  // A look built at a size, as meshes in its materials
  const look = async (recipe: Recipe | null, size: RecipeSize, params?: Record<string, unknown>) => {
    const g = new THREE.Group();
    const built = recipe && (await requestBuild(recipe, size, params));
    if (!built) return g;
    for (const [mat, geo] of partsGeometry(built.parts)) {
      const style = lookMaterial(mat, recipe, p.library.materials);
      const mesh = add(g, geo, standardMaterial(style));
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
  const jobs: Promise<void>[] = [];

  // Floors, in their material (its pattern, else its colour)
  for (const s of p.spaces) {
    if (!hasSlab(s)) continue;
    const { y, thickness } = slabLevel(s, elev.get(s.level) ?? 0, p.site.groundLevel);
    const m = floorMaterial(p, s.floor);
    const material = standardMaterial(m ? materialStyle(m) : plain(white, 1));
    if (m && materialPattern(m)) {
      material.color.set(white);
      material.map = await floorTexture(doc, m);
    }
    const mesh = add(house, slabGeometry(s.shape, thickness), material);
    mesh.position.y = (y + 2 - thickness) * M;
    mesh.receiveShadow = true;
  }

  // Walls in their finish, one solid each (glass is drawn by the openings' looks); railings by their look, piece by piece
  for (const w of p.walls) {
    const base = elev.get(w.level) ?? 0;
    if (w.kind === 'railing') {
      const recipe = lookRecipe(p, wallTarget(w), w.look);
      for (const b of railingPieces(p, w))
        jobs.push(
          look(recipe, { w: b.length, d: b.thickness, h: b.height }, w.lookParams).then(g => place(g, [b.center[0], base + b.z, b.center[1]], b.angle)),
        );
      continue;
    }
    const mesh = add(house, wallGeometry(p, w, footing(base, p.site.groundLevel)), standardMaterial(wallFinish(p, w)));
    mesh.position.set(w.start[0] * M, base * M, w.start[1] * M);
    mesh.castShadow = mesh.receiveShadow = true;
  }

  // Doors and windows
  for (const fr of openingFrames(p)) {
    const size = { w: fr.width, d: fr.thickness, h: fr.height };
    jobs.push(
      look(lookRecipe(p, openingTarget(fr.opening), fr.opening.look), size, fr.opening.lookParams).then(g =>
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
    const mesh = add(house, solidGeometry(s), standardMaterial(style));
    mesh.position.y = ((elev.get(s.level) ?? 0) + s.z) * M;
    mesh.castShadow = s.kind === 'structure';
    mesh.receiveShadow = true;
  }

  // Furniture
  for (const f of p.furniture) {
    jobs.push(
      look(lookRecipe(p, furnitureTarget(f), f.look), f.size, f.lookParams).then(g =>
        place(g, [f.position[0], (elev.get(f.level) ?? 0) + (f.elevation ?? 0), f.position[1]], (f.rotation * Math.PI) / 180),
      ),
    );
  }
  await Promise.all(jobs);

  const scene = new THREE.Scene();
  // The 3D view's backdrop: the sky (with the default style) or the plain backdrop
  scene.background = modelStyle().sky ? keep(skyTexture(themeColor('--canvas-sky', doc), themeColor('--canvas-backdrop', doc))) : color('--canvas-backdrop');
  scene.add(house);
  // Framed like the editor's default view, on the walls and floors of every level
  const box = houseBox(p, projectBoxes(p), new Set(p.levels.map(l => l.id)));
  const center = box.getCenter(new THREE.Vector3()),
    radius = Math.max(2, box.getSize(new THREE.Vector3()).length() / 2);

  // The house stands on the site's ground, which only catches shadows
  const ground = shadowGround(color('--canvas-shadow'), radius * 40);
  keep(ground.geometry);
  keep(ground.material);
  ground.position.set(center.x, p.site.groundLevel * M - 0.001, center.z);
  scene.add(ground);

  // The 3D view's light
  scene.add(new THREE.HemisphereLight(color('--canvas-skylight'), white, SKYLIGHT_INTENSITY));
  const sun = sunLight(color('--canvas-sun'), center, radius);
  scene.add(sun, sun.target);

  const camera = new THREE.PerspectiveCamera(FOV, W / H, 0.05, radius * 40);
  const pose = framed(box, W / H, BIRD);
  camera.position.copy(pose.pos);
  camera.lookAt(pose.target);

  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, W, H);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/jpeg', 0.85);
  disposables.forEach(d => d.dispose());
  sun.shadow.map?.dispose();
  return url;
}
