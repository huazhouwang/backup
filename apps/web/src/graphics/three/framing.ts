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
/** Where an eye-level presentation view stands (issue 220): from the south-west, the side the late sun lights */
export const EYE_DIRECTION = new THREE.Vector3(-0.8, 0, 1).normalize();
/** An eye-level view's lens: a 35 mm-like field, wide enough to take in a house from across the street */
export const EYE_FOV = 50;

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

/** A camera at a person's eye height that looks level, the frame shifted up to take in the building (two-point perspective) */
export type EyePose = Pose & { shift: number };
/** Eye height above the ground (metres) */
export const EYE = 1.6;

/**
 * Two-point perspective, as architectural photographers shoot with a shift lens and SketchUp, Enscape and V-Ray set up a
 * presentation view: the camera stands at eye height and looks level, so verticals stay vertical; the frame is shifted
 * (`shift`, in half view heights) to centre the building instead of tilting the camera. The camera stands back along `dir`
 * (horizontal part) until the box fits.
 */
export function eyeLevel(box: THREE.Box3, aspect: number, dir: THREE.Vector3, fov = FOV, eye = EYE, fill = FILL, points?: THREE.Vector3[]): EyePose {
  const ty = Math.tan(THREE.MathUtils.degToRad(fov) / 2) * fill,
    tx = ty * aspect;
  const back = new THREE.Vector3(dir.x, 0, dir.z).normalize();
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), back).normalize();
  const corners = points ?? boxCorners(box);
  const c = box.getCenter(new THREE.Vector3());
  const ground = new THREE.Vector3(c.x, box.min.y + eye, c.z);
  const fits = (d: number) => {
    const pos = ground.clone().addScaledVector(back, d);
    const p = corners.map(k => {
      const o = k.clone().sub(pos);
      const depth = -o.dot(back);
      return depth <= 0.1 ? null : { x: o.dot(right) / depth, y: o.y / depth };
    });
    if (p.some(q => !q)) return null;
    const xs = p.map(q => q!.x),
      ys = p.map(q => q!.y);
    const w = Math.max(...xs) - Math.min(...xs),
      h = Math.max(...ys) - Math.min(...ys);
    return w <= 2 * tx && h <= 2 * ty ? { pos, mx: (Math.max(...xs) + Math.min(...xs)) / 2, my: (Math.max(...ys) + Math.min(...ys)) / 2 } : null;
  };
  let lo = 0.1,
    hi = box.getSize(new THREE.Vector3()).length() * 20;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  const f = fits(hi)!;
  // Sideways the camera itself moves to centre the building; vertically the lens shifts
  const pos = f.pos.clone().addScaledVector(right, f.mx * hi);
  return { pos, target: pos.clone().addScaledVector(back, -hi), shift: f.my / Math.tan(THREE.MathUtils.degToRad(fov) / 2) };
}

const boxCorners = (b: THREE.Box3) => [b.min, b.max].flatMap(x => [b.min, b.max].flatMap(y => [b.min, b.max].map(z => new THREE.Vector3(x.x, y.y, z.z))));

/**
 * What a view has to take in: the corners of every mesh's own box, so a low wall in front isn't framed as if the house rose to
 * full height there (the house's overall box has empty corners)
 */
export function framePoints(root: THREE.Object3D) {
  const points: THREE.Vector3[] = [];
  root.updateMatrixWorld(true);
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.visible || !m.geometry || m.userData.ground) return;
    m.geometry.computeBoundingBox();
    points.push(...boxCorners(m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld)));
  });
  return points;
}

/**
 * An eye-level pose as an orbit pose: the camera where it stands, aimed at the point its shifted frame centres on, so a level
 * camera with automatic two-point correction (twoPoint) reproduces it
 */
export function eyeOrbitPose(e: EyePose, fov: number): Pose {
  const forward = e.target.clone().sub(e.pos);
  const d = forward.length();
  const target = e.target.clone();
  target.y += e.shift * Math.tan(THREE.MathUtils.degToRad(fov) / 2) * d;
  return { pos: e.pos.clone(), target };
}

const smooth = (a: number, b: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/**
 * Automatic two-point perspective, as Enscape offers it: while the camera looks at its target from near level, it looks level
 * instead and shifts the frame to keep the target centred, so verticals stay vertical; looking down more steeply it blends back
 * to an ordinary perspective. Call after the camera has been aimed at `target`, before drawing; `w` × `h` is the frame.
 */
export function twoPoint(camera: THREE.PerspectiveCamera, target: THREE.Vector3, w: number, h: number) {
  const to = target.clone().sub(camera.position);
  const pitch = Math.atan2(to.y, Math.hypot(to.x, to.z));
  // Fully corrected within 20° of level, ordinary perspective beyond 35°
  const k = 1 - smooth(THREE.MathUtils.degToRad(20), THREE.MathUtils.degToRad(35), Math.abs(pitch));
  if (k <= 0) return shiftLens(camera, 0, w, h);
  const aim = pitch * (1 - k);
  const level = camera.position.clone().add(new THREE.Vector3(to.x, Math.hypot(to.x, to.z) * Math.tan(aim), to.z));
  camera.lookAt(level);
  shiftLens(camera, Math.tan(pitch - aim) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), w, h);
}

/** Applies a pose's lens shift to a camera rendering a `w` × `h` frame (0 clears it) */
export function shiftLens(camera: THREE.PerspectiveCamera, shift: number, w: number, h: number) {
  if (Math.abs(shift) < 1e-4) {
    if (camera.view?.enabled) camera.clearViewOffset();
  } else camera.setViewOffset(w, h, 0, (-shift * h) / 2, w, h);
}
