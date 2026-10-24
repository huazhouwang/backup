/**
 * A still of a look, for the chat, the agent's self-check and the library pages: the recipe built at a size and drawn from
 * three sides in one image (three-quarter view, front, top), or only the three-quarter view, always from the same direction and
 * fitted to the frame, in the canvas's light theme and the default model style's light. One offscreen renderer draws every still
 * in turn (a page of looks would otherwise run out of WebGL contexts), and recent stills are kept.
 */
import { buildRecipe, type Material, type Recipe } from '@plinth/core';
import * as THREE from 'three';
import { lightDocument } from '@/canvas/CanvasFrame';
import { themeColor } from '@/lib/theme';
import { cameraPosition, FOV, lookBounds, stageGround, stageSun } from './look-stage';
import { castsShadow, M, standardMaterial } from './scene';
import { lookMaterial, partsGeometry } from './looks';

type Opts = { width?: number; height?: number; single?: boolean; params?: Record<string, unknown>; materials?: Record<string, Material> };

let shared: THREE.WebGLRenderer | null = null;
let queue: Promise<unknown> = Promise.resolve();

/** Draw with the one offscreen renderer, after the stills queued before (also used for house stills, house-still.ts) */
export function withStillRenderer<T>(draw: (renderer: THREE.WebGLRenderer) => Promise<T>): Promise<T> {
  const run = queue.then(() =>
    draw((shared ??= new THREE.WebGLRenderer({ canvas: document.createElement('canvas'), antialias: true, preserveDrawingBuffer: true }))),
  );
  queue = run.catch(() => {});
  return run;
}
const stills = new Map<string, Promise<string>>();
const ids = new WeakMap<object, number>();
let nextId = 1;
/** Identity of a recipe (its object), so stills of the same recipe are reused */
const idOf = (o: object) => ids.get(o) ?? (ids.set(o, nextId), nextId++);

/** `single`: only the three-quarter view, filling the image */
export function renderLookPreview(recipe: Recipe, size: { w: number; d: number; h: number }, opts: Opts = {}): Promise<string> {
  const key = JSON.stringify([idOf(recipe), recipe.script.length, size, opts]);
  let still = stills.get(key);
  if (!still) {
    if (stills.size > 400) stills.delete(stills.keys().next().value!);
    still = withStillRenderer(r => draw(r, recipe, size, opts));
    stills.set(key, still);
    still.catch(() => stills.delete(key));
  }
  return still;
}

async function draw(renderer: THREE.WebGLRenderer, recipe: Recipe, size: { w: number; d: number; h: number }, opts: Opts): Promise<string> {
  const W = opts.width ?? 960,
    H = opts.height ?? 320,
    doc = await lightDocument();
  const canvas = renderer.domElement;
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setScissorTest(true);
  renderer.shadowMap.enabled = !!opts.single;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const color = (t: string) => new THREE.Color(themeColor(t, doc));
  scene.background = color('--canvas-backdrop');
  scene.add(new THREE.HemisphereLight(color('--canvas-skylight'), color('--card'), 2.4));
  const parts = partsGeometry((await buildRecipe(recipe, size, opts.params).catch(() => ({ parts: [] }))).parts);
  const materials: THREE.Material[] = [];
  for (const [mat, g] of parts) {
    const style = lookMaterial(mat, recipe, opts.materials);
    const material = standardMaterial(style);
    materials.push(material);
    const mesh = new THREE.Mesh(g, material);
    mesh.castShadow = castsShadow(style);
    scene.add(mesh);
  }
  const { center, radius } = lookBounds(
    parts.map(([, g]) => g),
    size,
  );
  const sun = stageSun(color('--canvas-sun'), center, radius);
  scene.add(sun, sun.target);
  // On show, it stands on the ground in its soft shadow; for checking (three views), the outline of its footprint shows where
  // parts stray outside it
  const floor = opts.single
    ? stageGround(radius)
    : new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.PlaneGeometry(size.w * M, size.d * M).rotateX(-Math.PI / 2)),
        new THREE.LineBasicMaterial({ color: color('--muted-foreground') }),
      );
  scene.add(floor);
  const vw = opts.single ? W : W / 3,
    aspect = vw / H;
  const ortho = (dir: THREE.Vector3, up: THREE.Vector3) => {
    const r = radius * 1.1,
      cam = new THREE.OrthographicCamera(-r * aspect, r * aspect, r, -r, 0.01, radius * 10);
    cam.up.copy(up);
    cam.position.copy(center).addScaledVector(dir, radius * 4);
    cam.lookAt(center);
    return cam;
  };
  const persp = new THREE.PerspectiveCamera(FOV, aspect, 0.01, radius * 20);
  persp.position.copy(cameraPosition(center, radius));
  persp.lookAt(center);
  const views: THREE.Camera[] = opts.single
    ? [persp]
    : [persp, ortho(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)), ortho(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1))];
  views.forEach((cam, i) => {
    renderer.setViewport(i * vw, 0, vw, H);
    renderer.setScissor(i * vw, 0, vw, H);
    renderer.render(scene, cam);
  });
  const url = canvas.toDataURL('image/png');
  for (const [, g] of parts) g.dispose();
  materials.forEach(m => m.dispose());
  floor.geometry.dispose();
  (floor.material as THREE.Material).dispose();
  sun.shadow.map?.dispose();
  return url;
}
