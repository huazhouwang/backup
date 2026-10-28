/**
 * A still of a whole house in 3D, for the design list: the house's scene (house-scene.ts), seen from the 3D view's default
 * direction, with its sun and shadows. Drawn offscreen on the one renderer the look stills share (look-preview.ts), as a JPEG data
 * URL.
 */
import type { Project } from '@opensu/core';
import * as THREE from 'three';
import { lightDocument } from '@/canvas/CanvasFrame';
import { BIRD, FOV, framed, nearPlane } from './framing';
import { houseScene } from './house-scene';
import { withStillRenderer } from './look-preview';

export function renderHouseStill(project: Project, opts: { width?: number; height?: number } = {}): Promise<string> {
  return withStillRenderer(r => draw(r, project, opts.width ?? 640, opts.height ?? 480));
}

async function draw(renderer: THREE.WebGLRenderer, p: Project, W: number, H: number): Promise<string> {
  const hs = await houseScene(p, await lightDocument());
  // Framed like the editor's default view, on the walls and floors of every level
  const pose = framed(hs.box, W / H, BIRD);
  const camera = new THREE.PerspectiveCamera(FOV, W / H, nearPlane(pose.pos.distanceTo(pose.target)), hs.radius * 40);
  camera.position.copy(pose.pos);
  camera.lookAt(pose.target);

  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, W, H);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.render(hs.scene, camera);
  const url = renderer.domElement.toDataURL('image/jpeg', 0.85);
  hs.dispose();
  return url;
}
