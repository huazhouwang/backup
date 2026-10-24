import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { alongAxis, axisOnScreen, infer, nearestOnAxis, parts } from './measure-infer';

// A camera looking at the origin from the south-east and above, on a 1000 × 800 screen
const camera = new THREE.PerspectiveCamera(50, 1000 / 800, 0.1, 1000);
camera.position.set(10, 8, 10);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld();
const screen = (p: THREE.Vector3) => {
  const q = p.clone().project(camera);
  return new THREE.Vector2(((q.x + 1) / 2) * 1000, ((1 - q.y) / 2) * 800);
};
const rayAt = (pointer: THREE.Vector2) => {
  const r = new THREE.Raycaster();
  r.setFromCamera(new THREE.Vector2((pointer.x / 1000) * 2 - 1, -(pointer.y / 800) * 2 + 1), camera);
  return r.ray;
};
const from = new THREE.Vector3(0, 0, 0);

describe('3D tape measure inference', () => {
  it('finds the point of an axis nearest to a ray', () => {
    const ray = new THREE.Ray(new THREE.Vector3(3, 5, 5), new THREE.Vector3(0, 0, -1));
    expect(nearestOnAxis(from, new THREE.Vector3(1, 0, 0), ray)?.toArray()).toEqual([3, 0, 0]);
    // Looking straight along the axis there is no nearest point
    expect(nearestOnAxis(from, new THREE.Vector3(0, 0, 1), ray)).toBeNull();
  });

  it('locks onto the axis the pointer follows on screen', () => {
    for (const [axis, at] of [
      ['x', new THREE.Vector3(3, 0, 0)],
      ['y', new THREE.Vector3(0, 0, 3)],
      ['z', new THREE.Vector3(0, 3, 0)],
    ] as const) {
      const pointer = screen(at).add(new THREE.Vector2(3, -2));
      expect(axisOnScreen(from, pointer, screen)).toBe(axis);
      const got = infer({ ray: rayAt(pointer), pointer, screen, hit: null, from, held: null });
      expect(got?.axis).toBe(axis);
      // The point lies on that axis through the first point, near where the pointer is
      expect(alongAxis(from, got!.point)).toBe(axis);
      expect(got!.point.distanceTo(at)).toBeLessThan(0.2);
    }
  });

  it('leaves a slanting direction free', () => {
    const at = new THREE.Vector3(3, 1, -1);
    const pointer = screen(at);
    expect(axisOnScreen(from, pointer, screen)).toBeNull();
    const got = infer({ ray: rayAt(pointer), pointer, screen, hit: { point: at, corners: [] }, from, held: null });
    expect(got).toMatchObject({ axis: null, endpoint: false });
  });

  it('snaps to an endpoint of the face under the pointer', () => {
    const corner = new THREE.Vector3(1, 1, -1);
    const pointer = screen(corner).add(new THREE.Vector2(5, 4));
    const got = infer({
      ray: rayAt(pointer),
      pointer,
      screen,
      hit: { point: new THREE.Vector3(0.9, 1, -1), corners: [corner, new THREE.Vector3(5, 0, 5)] },
      from: null,
      held: null,
    });
    expect(got).toMatchObject({ endpoint: true });
    expect(got!.point.equals(corner)).toBe(true);
  });

  it('holds an axis with Shift wherever the pointer goes', () => {
    const pointer = screen(new THREE.Vector3(2, 2, 2));
    const got = infer({ ray: rayAt(pointer), pointer, screen, hit: null, from, held: 'z' });
    expect(got?.axis).toBe('z');
    expect(got!.point.x).toBeCloseTo(0);
    expect(got!.point.z).toBeCloseTo(0);
  });

  it('reads the length, the run and the rise in millimetres', () => {
    expect(parts(new THREE.Vector3(0, 0, 0), new THREE.Vector3(3, 4, 0))).toEqual({ length: 5000, run: 3000, rise: 4000 });
  });
});
