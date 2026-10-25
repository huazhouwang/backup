/**
 * Where true north points on screen in the 3D view (degrees clockwise from straight up), published by the camera as it turns
 * for the compass drawn over the canvas. A plain shared value: it changes every frame while orbiting or walking, more often
 * than the editor's store should.
 */
import { useSyncExternalStore } from 'react';
import type * as THREE from 'three';
import { northOnPlan } from '@/lib/solar';

let heading = 0;
const listeners = new Set<() => void>();

/** From the camera's view direction: the angle from its forward direction on the ground to true north */
export function publishHeading(camera: THREE.Camera, northAngle: number) {
  const e = camera.matrixWorld.elements;
  // The camera looks down its -z axis; on the ground that is (x, z), the plan's (x, y)
  let fx = -e[8],
    fy = -e[10];
  // Looking straight down, the camera's up is the screen's up
  if (Math.hypot(fx, fy) < 1e-3) [fx, fy] = [e[4], e[6]];
  const [nx, ny] = northOnPlan(northAngle);
  const deg = (Math.atan2(fx * ny - fy * nx, fx * nx + fy * ny) * 180) / Math.PI;
  if (Math.abs(deg - heading) < 0.5) return;
  heading = deg;
  for (const l of listeners) l();
}

export const useHeading = () =>
  useSyncExternalStore(
    l => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => heading,
  );
