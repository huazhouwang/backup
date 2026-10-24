import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { hops, REVEAL } from '@/canvas/hop';
import { useEditor } from '../store';

/**
 * When the selected object is hidden by walls (e.g. furniture in a room), raise the camera, aim at it to reveal it, then hop.
 * If it is already visible the camera stays put.
 */
export function Reveal({ ownerOf }: { ownerOf: (id: string) => string | undefined }) {
  const selection = useEditor(s => s.view.selection);
  const { camera, scene, controls, invalidate } = useThree();
  const anim = useRef<{ t0: number; from: [THREE.Vector3, THREE.Vector3]; to: [THREE.Vector3, THREE.Vector3]; id: string } | null>(null);
  const prev = useRef<string[]>([]);

  useEffect(() => {
    const id = selection.find(x => !prev.current.includes(x));
    prev.current = selection;
    if (!id) return;
    const target = ownerOf(id) ?? id;
    const parts: THREE.Mesh[] = [];
    scene.traverse(o => {
      if ((o as THREE.Mesh).isMesh && o.userData.id === target) parts.push(o as THREE.Mesh);
    });
    if (!parts.length) return;
    const box = new THREE.Box3();
    for (const m of parts) box.expandByObject(m);
    const center = box.getCenter(new THREE.Vector3());
    const top = new THREE.Vector3(center.x, box.max.y, center.z);
    if ([center, top].some(p => visible(p, target))) return;

    // Hidden: keep the azimuth, raise the camera to near top-down and aim at it
    const orbit = controls as unknown as { target: THREE.Vector3 } | null;
    const fromTarget = orbit?.target.clone() ?? new THREE.Vector3();
    const offset = camera.position.clone().sub(fromTarget);
    const s = new THREE.Spherical().setFromVector3(offset);
    s.phi = Math.min(s.phi, 0.45);
    const toTarget = new THREE.Vector3(center.x, box.min.y, center.z);
    const toPos = toTarget.clone().add(new THREE.Vector3().setFromSpherical(s));
    anim.current = { t0: performance.now(), from: [camera.position.clone(), fromTarget], to: [toPos, toTarget], id };
    invalidate();
  }, [selection]);

  /** Whether the first solid hit from the camera to this point is the target itself (see-through surfaces do not occlude) */
  const visible = (p: THREE.Vector3, target: string) => {
    const ray = new THREE.Raycaster(camera.position, p.clone().sub(camera.position).normalize());
    const far = camera.position.distanceTo(p);
    for (const hit of ray.intersectObjects(scene.children, true)) {
      const o = hit.object as THREE.Mesh;
      if (!o.isMesh || !o.userData.id) continue;
      if (o.userData.id === target) return true;
      if ((o.material as THREE.Material).transparent) continue;
      return hit.distance > far - 0.05;
    }
    return true;
  };

  useFrame(({ invalidate }) => {
    const a = anim.current;
    if (!a) return;
    invalidate();
    const t = Math.min(1, (performance.now() - a.t0) / REVEAL.ms);
    const k = t * t * (3 - 2 * t);
    camera.position.lerpVectors(a.from[0], a.to[0], k);
    const orbit = controls as unknown as { target: THREE.Vector3; update(): void } | null;
    orbit?.target.lerpVectors(a.from[1], a.to[1], k);
    orbit?.update();
    if (t === 1) {
      anim.current = null;
      hops.poke(a.id);
    }
  });
  return null;
}
