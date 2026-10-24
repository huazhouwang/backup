/** Input on the 3D view beyond OrbitControls: picking objects, and Safari's trackpad pinch */
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import * as THREE from 'three';
import { useEditorStore } from '../store';
import type { Orbit } from './CameraRig';

export function SafariPinch() {
  const { gl, camera, controls } = useThree();
  useEffect(() => {
    const orbit = controls as unknown as (Orbit & { minDistance: number; maxDistance: number }) | null;
    if (!orbit) return;
    const el = gl.domElement;
    let last = 1;
    const start = (e: Event) => {
      e.preventDefault();
      last = 1;
    };
    const change = (e: Event) => {
      e.preventDefault();
      const scale = (e as Event & { scale: number }).scale;
      const o = camera.position.clone().sub(orbit.target);
      camera.position.copy(orbit.target).add(o.setLength(THREE.MathUtils.clamp((o.length() * last) / scale, orbit.minDistance, orbit.maxDistance)));
      last = scale;
      orbit.update();
    };
    el.addEventListener('gesturestart', start);
    el.addEventListener('gesturechange', change);
    return () => {
      el.removeEventListener('gesturestart', start);
      el.removeEventListener('gesturechange', change);
    };
  }, [gl, camera, controls]);
  return null;
}

/**
 * Picking: a press and release in (nearly) the same spot selects the object under the pointer; a drag rotates and picks nothing.
 * Done on pointer events instead of the browser's click, which OrbitControls' pointer capture makes unreliable in some browsers.
 * Shift or Cmd adds to / removes from the selection, like the plan.
 */
export function Picker() {
  const { gl, camera, scene, raycaster } = useThree();
  const store = useEditorStore();
  useEffect(() => {
    const el = gl.domElement;
    let down: { x: number; y: number; id: number } | null = null;
    // A second finger (pinch) cancels the pick
    const onDown = (e: PointerEvent) => {
      down = !down && e.button === 0 && e.isPrimary ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null;
    };
    const onCancel = () => {
      down = null;
    };
    const onUp = (e: PointerEvent) => {
      const d = down;
      down = null;
      if (!d || d.id !== e.pointerId || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;
      const r = el.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      // The first surface hit: edge lines don't count, the ground counts as empty space
      const hit = raycaster.intersectObjects(scene.children, true).find(h => (h.object as THREE.Mesh).isMesh);
      const id: string | undefined = hit?.object.userData.id;
      const { select, view } = store.getState();
      if (!id) return select([]);
      if (e.shiftKey || e.metaKey) select(view.selection.includes(id) ? view.selection.filter(x => x !== id) : [...view.selection, id]);
      else select([id]);
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
    };
  }, [gl, camera, scene, raycaster, store]);
  return null;
}
