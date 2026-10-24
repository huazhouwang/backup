/**
 * How the 3D view frames a house: the default direction (from the south-east, looking down at about 45 degrees) and a camera that
 * fits a box, shared by the editor's 3D view and the house stills on the design list
 */
import * as THREE from 'three';

export type Pose = { pos: THREE.Vector3; target: THREE.Vector3 };
export const FOV = 40;
/** How much of the view the framed model fills (in its tighter direction) */
const FILL = 0.86;
/**
 * The near plane for a camera this far from what it looks at (metres). Depth precision falls with the square of the distance over
 * the near plane: with a fixed 0.1 m, a phone framing a whole house from 60 m away resolves only about 2 mm, and floors flicker
 * against the tops of the walls below them. At 2% of the distance it stays a fraction of a millimetre.
 */
export const nearPlane = (distance: number) => Math.max(0.05, distance * 0.02);
/** Default viewing direction: from the south-east, looking down at about 45°, steep enough to see into the rooms */
export const BIRD = new THREE.Vector3(0.9, 1.4, 1.1).normalize();

/**
 * Camera looking from this direction at the model's box: close enough that the box fills the view, and aimed so its outline
 * sits in the middle of the screen. The aim point is where the camera then orbits, so the model stays centered while rotating.
 */
export function framed(box: THREE.Box3, aspect: number, dir: THREE.Vector3): Pose {
  const ty = Math.tan(THREE.MathUtils.degToRad(FOV) / 2) * FILL,
    tx = ty * aspect;
  const back = dir.clone().normalize();
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), back).normalize();
  const up = new THREE.Vector3().crossVectors(back, right);
  const corners = [box.min, box.max].flatMap(a => [box.min, box.max].flatMap(b => [box.min, box.max].map(c => new THREE.Vector3(a.x, b.y, c.z))));
  const target = box.getCenter(new THREE.Vector3());
  let dist = 1;
  // Perspective makes the outline's middle drift from the box center: fit, measure the outline on screen, re-aim, repeat
  for (let i = 0; i < 4; i++) {
    const rel = corners.map(p => {
      const o = p.clone().sub(target);
      return { x: o.dot(right), y: o.dot(up), d: o.dot(back) };
    });
    dist = Math.max(...rel.map(r => r.d + Math.max(Math.abs(r.x) / tx, Math.abs(r.y) / ty)));
    const sx = rel.map(r => r.x / (dist - r.d)),
      sy = rel.map(r => r.y / (dist - r.d));
    const mx = (Math.min(...sx) + Math.max(...sx)) / 2,
      my = (Math.min(...sy) + Math.max(...sy)) / 2;
    target.addScaledVector(right, mx * dist).addScaledVector(up, my * dist);
  }
  return { target, pos: target.clone().addScaledVector(back, dist) };
}
