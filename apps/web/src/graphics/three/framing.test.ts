// Eye-level framing (issue 220): a level camera at eye height whose shifted frame takes in the whole house
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { EYE, eyeLevel, FOV, shiftLens } from './framing';

const corners = (b: THREE.Box3) => [b.min, b.max].flatMap(a => [b.min, b.max].flatMap(c => [b.min, b.max].map(d => new THREE.Vector3(a.x, c.y, d.z))));

describe('eye-level framing', () => {
  it.each([
    [new THREE.Vector3(-0.8, 0, 1), 60],
    [new THREE.Vector3(0.9, 0.7, 1.1), FOV],
    [new THREE.Vector3(1, 0, 0.2), 50],
  ])('stands at eye height, looks level and fits the box, centred (%#)', (dir, fov) => {
    const box = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(15, 12, 13));
    const W = 960,
      H = 600;
    const pose = eyeLevel(box, W / H, dir, fov);
    expect(pose.pos.y).toBeCloseTo(EYE);
    expect(pose.target.y).toBeCloseTo(EYE);
    const camera = new THREE.PerspectiveCamera(fov, W / H, 0.1, 1000);
    camera.position.copy(pose.pos);
    camera.lookAt(pose.target);
    shiftLens(camera, pose.shift, W, H);
    camera.updateMatrixWorld();
    const ndc = corners(box).map(c => c.clone().project(camera));
    const xs = ndc.map(p => p.x),
      ys = ndc.map(p => p.y);
    for (const v of [...xs, ...ys]) expect(Math.abs(v)).toBeLessThanOrEqual(1);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(0, 1);
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(0, 1);
    // Verticals stay vertical: a corner's bottom and top project to the same x
    const bottom = new THREE.Vector3(box.max.x, 0, box.max.z).project(camera),
      top = new THREE.Vector3(box.max.x, 12, box.max.z).project(camera);
    expect(top.x).toBeCloseTo(bottom.x, 5);
  });
});
