/**
 * What a walker meets in the 3D scene, as in wushi-amr's walk: walls and windows stop a 0.25 m body and it slides along them;
 * the highest surface under the feet is the ground, a step up to 0.4 m is climbed (so stairs lead upstairs) and with nothing
 * underneath the walker falls. Doors, furniture and drawings are walked through. Built from the scene's meshes, each found
 * by the project object it shows (its userData.id, or a parent's).
 */
import * as THREE from 'three';

export const BODY = 0.25;
export const STEP_UP = 0.4;
export const EYE = 1.6;
/** Heights above the feet the body is felt at (above a climbable step, up to the head) */
const FEEL = [STEP_UP + 0.1, 1.0, 1.5];
/** Directions felt around the body */
const AROUND = Array.from({ length: 12 }, (_, i) => new THREE.Vector3(Math.cos((i * Math.PI) / 6), 0, Math.sin((i * Math.PI) / 6)));

/** How the walker treats a mesh: it stops the body, carries the feet, both, or neither */
export type Role = { block: boolean; ground: boolean };

interface Piece {
  mesh: THREE.Mesh;
  box: THREE.Box3;
}

export interface World {
  blockers: Piece[];
  grounds: Piece[];
}

/** The id of the project object a mesh shows: its own or its nearest parent's */
function ownerId(o: THREE.Object3D): string | undefined {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (typeof p.userData.id === 'string') return p.userData.id;
  return undefined;
}

/** Gather the scene's solid meshes by role (lines, labels and the tape measure's marks are skipped) */
export function buildWorld(scene: THREE.Object3D, roleOf: (id: string | undefined) => Role): World {
  const world: World = { blockers: [], grounds: [] };
  scene.updateMatrixWorld(true);
  scene.traverse(o => {
    const mesh = o as THREE.Mesh & { isLine2?: boolean };
    if (!mesh.isMesh || mesh.isLine2 || !mesh.visible || o.userData.measure || !mesh.geometry?.getAttribute('position')) return;
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return;
    const role = roleOf(ownerId(o));
    if (!role.block && !role.ground) return;
    const piece = { mesh, box: new THREE.Box3().setFromObject(mesh) };
    if (role.block) world.blockers.push(piece);
    if (role.ground) world.grounds.push(piece);
  });
  return world;
}

const ray = new THREE.Raycaster();
const near = (pieces: Piece[], box: THREE.Box3) => pieces.filter(p => p.box.intersectsBox(box)).map(p => p.mesh);

/** The highest surface under (x, z) no higher than a step above the feet, or null with nothing underneath */
export function groundAt(world: World, x: number, z: number, foot: number): number | null {
  const from = new THREE.Vector3(x, foot + STEP_UP, z);
  const meshes = near(world.grounds, new THREE.Box3(new THREE.Vector3(x - 0.01, -1e4, z - 0.01), new THREE.Vector3(x + 0.01, from.y, z + 0.01)));
  ray.set(from, new THREE.Vector3(0, -1, 0));
  ray.far = 1e4;
  const hit = ray.intersectObjects(meshes, false)[0];
  return hit ? hit.point.y : null;
}

/** Where the body ends up moving to (x, z): pushed out of whatever it would stand in, so it slides along walls */
export function collide(world: World, x: number, z: number, foot: number): [number, number] {
  const box = new THREE.Box3(new THREE.Vector3(x - 1, foot + FEEL[0] - 0.01, z - 1), new THREE.Vector3(x + 1, foot + FEEL[FEEL.length - 1] + 0.01, z + 1));
  const meshes = near(world.blockers, box);
  if (!meshes.length) return [x, z];
  const at = new THREE.Vector3();
  // Each pass pushes out of the deepest overlap; a corner takes a pass per wall
  for (let pass = 0; pass < 4; pass++) {
    let deepest: { n: THREE.Vector3; depth: number } | null = null;
    for (const h of FEEL)
      for (const dir of AROUND) {
        ray.set(at.set(x, foot + h, z), dir);
        ray.far = BODY;
        const hit = ray.intersectObjects(meshes, false)[0];
        if (!hit) continue;
        // The surface's normal, flattened and facing the body (else straight back), and how far the body is into it
        const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld).setY(0) : new THREE.Vector3();
        if (n.lengthSq() < 1e-6) n.copy(dir).negate();
        n.normalize();
        if (n.dot(dir) > 0) n.negate();
        const depth = BODY - hit.distance * -n.dot(dir);
        if (depth > 1e-4 && (!deepest || depth > deepest.depth)) deepest = { n, depth };
      }
    if (!deepest) break;
    x += deepest.n.x * deepest.depth;
    z += deepest.n.z * deepest.depth;
  }
  return [x, z];
}
