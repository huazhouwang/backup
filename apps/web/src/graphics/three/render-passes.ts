/**
 * The passes a style render starts from (issue 195), for one shot of a design, drawn offscreen from the house's scene
 * (house-scene.ts) on the shared still renderer:
 * - colour: the house as the 3D view draws it (its materials, sky and sun; rooms evenly lit, without the sun's shadows);
 * - depth: near white to far black, linear between the nearest and farthest parts of the house in view;
 * - lines: the model's edges in black on white, hidden lines removed;
 * - mask: every surface in the flat ADE20K colour of what it is (core's MASK_COLORS).
 * The image model is conditioned on these, so the render keeps the design's geometry; which ones a provider takes is its choice.
 */
import { maskClass, MASK_COLORS, type Project, type Shot } from '@opensu/core';
import * as THREE from 'three';
import { lightDocument } from '@/canvas/CanvasFrame';
import { themeColor } from '@/lib/theme';
import { framed, nearPlane } from './framing';
import { houseScene, type HousePart } from './house-scene';
import { withStillRenderer } from './look-preview';
import { M } from './scene';

export const PASSES = ['color', 'depth', 'lines', 'mask'] as const;
export type Pass = (typeof PASSES)[number];
export type Passes = Record<Pass, string>;

/** Render size: 4:3 at 1024 px across, what the image models take without resizing much */
export const PASS_SIZE = { width: 1024, height: 768 };

export function renderPasses(p: Project, shot: Shot, size = PASS_SIZE): Promise<Passes> {
  return withStillRenderer(r => draw(r, p, shot, size.width, size.height));
}

/** An sRGB colour exactly as written to the image (the renderer converts from linear on output) */
const exact = ([r, g, b]: [number, number, number]) => new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);

async function draw(renderer: THREE.WebGLRenderer, p: Project, shot: Shot, W: number, H: number): Promise<Passes> {
  const doc = await lightDocument();
  const hs = await houseScene(p, doc);
  const { scene, house, ground, sun } = hs;
  const inside = shot.kind === 'room';

  // The camera: outside, framed on the house from the shot's direction; inside, at the shot's eye
  const camera = new THREE.PerspectiveCamera(shot.fov, W / H, 0.05, hs.radius * 40);
  if (shot.kind === 'room') {
    camera.position.set(shot.eye[0] * M, shot.eye[1] * M, shot.eye[2] * M);
    camera.lookAt(shot.target[0] * M, shot.target[1] * M, shot.target[2] * M);
    camera.near = 0.05;
  } else {
    const pose = framed(hs.box, W / H, new THREE.Vector3(...shot.dir));
    camera.position.copy(pose.pos);
    camera.lookAt(pose.target);
    camera.near = nearPlane(pose.pos.distanceTo(pose.target));
  }
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  scene.updateMatrixWorld(true);

  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, W, H);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const meshes: THREE.Mesh[] = [];
  house.traverse(o => o instanceof THREE.Mesh && meshes.push(o));
  const snap = (type: 'image/jpeg' | 'image/png') => renderer.domElement.toDataURL(type, 0.9);
  const keep: { dispose(): void }[] = [];

  // Inside, the slabs above are seen from below: a plain ceiling, not the floor finish of the room upstairs
  const ceiling = new THREE.MeshStandardMaterial({ color: new THREE.Color(themeColor('--card', doc)), roughness: 0.95 });
  const finishes = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  if (inside)
    for (const m of meshes)
      if (m.userData.part === 'floor' && new THREE.Box3().setFromObject(m).min.y > camera.position.y) {
        finishes.set(m, m.material);
        m.material = ceiling;
      }

  // Colour: outside in the sun with shadows; inside without them, so the room isn't lost in the roof's shadow
  renderer.shadowMap.enabled = !inside;
  sun.castShadow = !inside;
  renderer.render(scene, camera);
  const color = snap('image/jpeg');
  for (const [m, mat] of finishes) m.material = mat;
  ceiling.dispose();
  renderer.shadowMap.enabled = false;
  const background = scene.background;

  // Depth, linear over what the camera sees of the house (the ground fades to black beyond it)
  const view = (v: THREE.Vector3) => -v.clone().applyMatrix4(camera.matrixWorldInverse).z;
  const corners = [hs.box.min, hs.box.max].flatMap(a =>
    [hs.box.min, hs.box.max].flatMap(b => [hs.box.min, hs.box.max].map(c => view(new THREE.Vector3(a.x, b.y, c.z)))),
  );
  // Inside, from the eye to a little beyond the window wall (what shows through the windows fades to black)
  const near = inside ? 0.3 : Math.max(0.1, Math.min(...corners)),
    far = inside ? roomDepth(shot) * 1.3 + 1 : Math.max(...corners);
  const depth = new THREE.ShaderMaterial({
    uniforms: { near: { value: near }, far: { value: far } },
    vertexShader: 'varying float vz; void main() { vec4 v = modelViewMatrix * vec4(position, 1.0); vz = -v.z; gl_Position = projectionMatrix * v; }',
    fragmentShader:
      'uniform float near; uniform float far; varying float vz; void main() { float d = clamp((vz - near) / (far - near), 0.0, 1.0); gl_FragColor = vec4(vec3(1.0 - d), 1.0); }',
    side: THREE.DoubleSide,
  });
  keep.push(depth);
  scene.background = new THREE.Color(0, 0, 0);
  scene.overrideMaterial = depth;
  renderer.render(scene, camera);
  const depthUrl = snap('image/png');

  // Lines: the edges over white faces pushed back a little, so edges behind faces are hidden
  const faces = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1, 1, 1),
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    side: THREE.DoubleSide,
  });
  const ink = new THREE.LineBasicMaterial({ color: new THREE.Color(0, 0, 0) });
  keep.push(faces, ink);
  const lines = new THREE.Group();
  for (const m of meshes) {
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 25), ink);
    keep.push(edges.geometry);
    edges.matrixAutoUpdate = false;
    edges.matrix.copy(m.matrixWorld);
    lines.add(edges);
  }
  scene.add(lines);
  scene.background = new THREE.Color(1, 1, 1);
  ground.visible = false;
  scene.overrideMaterial = null;
  const original = new Map(meshes.map(m => [m, m.material]));
  for (const m of meshes) m.material = faces;
  renderer.render(scene, camera);
  const linesUrl = snap('image/png');
  scene.remove(lines);

  // Mask: each part in its class's colour; the ground is earth, the background sky
  const classes = new Map<string, THREE.MeshBasicMaterial>();
  const flat = (part: HousePart) => {
    const cls = maskClass(part, inside);
    let mat = classes.get(cls);
    if (!mat) classes.set(cls, (mat = new THREE.MeshBasicMaterial({ color: exact(MASK_COLORS[cls]), side: THREE.DoubleSide })));
    return mat;
  };
  // A slab above a room shot is its ceiling
  for (const m of meshes) m.material = flat(finishes.has(m) ? 'roof' : (m.userData.part as HousePart));
  const earth = new THREE.Mesh(
    new THREE.CircleGeometry(hs.radius * 40, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: exact(MASK_COLORS.earth) }),
  );
  keep.push(earth.geometry, earth.material);
  earth.position.copy(ground.position);
  scene.add(earth);
  scene.background = exact(MASK_COLORS.sky);
  renderer.render(scene, camera);
  const maskUrl = snap('image/png');
  scene.remove(earth);
  classes.forEach(c => c.dispose());

  // Put the scene back as it was, then let it go
  for (const [m, mat] of original) m.material = mat;
  scene.background = background;
  ground.visible = true;
  keep.forEach(k => k.dispose());
  hs.dispose();
  return { color, depth: depthUrl, lines: linesUrl, mask: maskUrl };
}

/** How deep a room shot looks (metres): from the eye to the target */
const roomDepth = (shot: Shot) =>
  shot.kind === 'room' ? Math.hypot(shot.eye[0] - shot.target[0], shot.eye[1] - shot.target[1], shot.eye[2] - shot.target[2]) * M : 10;
