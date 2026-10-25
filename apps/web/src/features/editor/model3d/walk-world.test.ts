import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BODY, buildWorld, collide, groundAt } from './walk-world';

// A floor, a wall along x = 2 (from z -5 to 5), a door leaf in it the walker passes through, and a stair of 0.17 m risers
// going up along -z from z = -1
const scene = new THREE.Scene();
const box = (id: string, size: [number, number, number], at: [number, number, number]) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size));
  m.position.set(...at);
  m.userData.id = id;
  scene.add(m);
};
box('floor', [20, 0.2, 20], [0, -0.1, 0]);
box('wall', [0.2, 3, 10], [2, 1.5, 0]);
box('door', [0.05, 2, 1], [-3, 1, 0]);
for (let i = 0; i < 10; i++) box('stair', [1, 0.17 * (i + 1), 0.26], [-1, (0.17 * (i + 1)) / 2, -1 - 0.26 * i - 0.13]);
const world = buildWorld(scene, id => ({ block: id === 'wall', ground: id !== 'door' }));

describe('walking through the scene', () => {
  it('stands on the floor, and on nothing beyond it', () => {
    expect(groundAt(world, 0, 0, 0)).toBeCloseTo(0);
    expect(groundAt(world, 30, 0, 0)).toBeNull();
  });

  it('climbs a step but not a wall', () => {
    // On the first step's edge from the floor: up 0.17 m
    expect(groundAt(world, -1, -1.13, 0)).toBeCloseTo(0.17);
    // The fifth step (0.85 m) is out of reach from the floor, but not from the fourth (0.68 m)
    expect(groundAt(world, -1, -1 - 0.26 * 4 - 0.13, 0)).toBeCloseTo(0);
    expect(groundAt(world, -1, -1 - 0.26 * 4 - 0.13, 0.68)).toBeCloseTo(0.85);
  });

  it('is stopped by a wall and slides along it', () => {
    // Walking diagonally into the wall's face (x = 1.9): kept a body away, still moving along z
    const [x, z] = collide(world, 1.85, 0.5, 0);
    expect(x).toBeCloseTo(1.9 - BODY, 2);
    expect(z).toBeCloseTo(0.5, 2);
  });

  it('walks through a door leaf and in the open', () => {
    expect(collide(world, -3, 0, 0)).toEqual([-3, 0]);
    expect(collide(world, 0, 0, 0)).toEqual([0, 0]);
  });
});
