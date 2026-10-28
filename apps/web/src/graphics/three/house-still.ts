/**
 * A still of a whole house in 3D, for the design list and the option cards: the house's scene (house-scene.ts), seen from the
 * 3D view's default direction, lit and finished like the 3D view (beauty.ts: sky light, sun and shadows, ambient occlusion). Drawn offscreen on the one renderer the look stills share (look-preview.ts), as a JPEG data
 * URL.
 */
import type { Project } from '@opensu/core';
import * as THREE from 'three';
import { lightDocument } from '@/canvas/CanvasFrame';
import { beautyComposer, LOOK, toneMap, type Look } from './beauty';
import { BIRD, FOV, framed, nearPlane } from './framing';
import { houseScene } from './house-scene';
import { withStillRenderer } from './look-preview';

/** `look`: other light values than the 3D view's (to compare settings) */
export function renderHouseStill(project: Project, opts: { width?: number; height?: number; look?: Look } = {}): Promise<string> {
  return withStillRenderer(r => draw(r, project, opts.width ?? 640, opts.height ?? 480, opts.look ?? LOOK));
}

async function draw(renderer: THREE.WebGLRenderer, p: Project, W: number, H: number, look: Look): Promise<string> {
  const hs = await houseScene(p, await lightDocument(), { renderer, look });
  // Framed like the editor's default view, on the walls and floors of every level
  const pose = framed(hs.box, W / H, BIRD);
  const camera = new THREE.PerspectiveCamera(FOV, W / H, nearPlane(pose.pos.distanceTo(pose.target)), hs.radius * 40);
  camera.position.copy(pose.pos);
  camera.lookAt(pose.target);

  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, W, H);
  toneMap(renderer, look);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const composer = beautyComposer(renderer, hs.scene, camera, W, H, { look });
  composer.render();
  const url = renderer.domElement.toDataURL('image/jpeg', 0.88);
  composer.dispose();
  hs.dispose();
  // The shared renderer goes back to plain output for the look stills
  renderer.toneMapping = THREE.NoToneMapping;
  return url;
}
