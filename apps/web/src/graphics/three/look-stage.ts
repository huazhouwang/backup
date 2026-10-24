/**
 * The stage a look is shown on, shared by its stills (look-preview.ts) and the live viewer on a look's page, so both start from
 * the same view: a camera from the front right, a little above, fitted to the look; a sky light and a sun nearly overhead; and a
 * ground that only shows the look's soft shadow.
 */
import * as THREE from 'three';
import { M } from './scene';

/** Where the camera looks from: front right, a little above */
export const VIEW_DIR = new THREE.Vector3(1, 0.8, 1.4).normalize();
export const FOV = 30;
/** The sun, relative to the look's centre in units of its radius: nearly overhead, so the shadow falls under it */
export const SUN_DIR = new THREE.Vector3(0.5, 3, 0.9).normalize();
/** How dark the shadow on the ground is */
export const SHADOW_OPACITY = 0.22;

/** The centre and radius of what a look built (in metres), at least its footprint and height */
export function lookBounds(geometries: THREE.BufferGeometry[], size: { w: number; d: number; h: number }) {
  const box = new THREE.Box3(
    new THREE.Vector3(-size.w / 2, 0, -size.d / 2).multiplyScalar(M),
    new THREE.Vector3(size.w / 2, size.h, size.d / 2).multiplyScalar(M),
  );
  for (const g of geometries) {
    g.computeBoundingBox();
    box.union(g.boundingBox!);
  }
  return { center: box.getCenter(new THREE.Vector3()), radius: box.getSize(new THREE.Vector3()).length() / 2 || 1 };
}

/** How far the camera is from a look of this radius so it fills a view of this aspect (width / height) without being cut off */
export function fitDistance(radius: number, aspect = 4 / 3) {
  const v = ((FOV / 2) * Math.PI) / 180,
    h = Math.atan(Math.tan(v) * aspect);
  return (radius / Math.sin(Math.min(v, h))) * 1.05;
}

/** The camera's position for a look of this centre and radius: far enough that it fills the view */
export const cameraPosition = (center: THREE.Vector3, radius: number, aspect?: number) => center.clone().addScaledVector(VIEW_DIR, fitDistance(radius, aspect));

/** A sun casting a soft shadow over the look's extent */
export function stageSun(color: THREE.ColorRepresentation, center: THREE.Vector3, radius: number) {
  const sun = new THREE.DirectionalLight(color, 1.4);
  sun.position.copy(center).addScaledVector(SUN_DIR, radius * 4);
  sun.target.position.copy(center);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.radius = 6;
  sun.shadow.bias = -0.0005;
  const c = sun.shadow.camera;
  c.left = c.bottom = -radius * 1.5;
  c.right = c.top = radius * 1.5;
  c.near = 0.01;
  c.far = radius * 10;
  return sun;
}

/** The ground: invisible except for the shadow it catches */
export function stageGround(radius: number) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(radius * 8, radius * 8).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: SHADOW_OPACITY }));
  ground.receiveShadow = true;
  return ground;
}
