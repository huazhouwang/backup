/**
 * The 3D view's light and backdrop, shared by the editor and the house stills: a warm white sun (from the south-west, or where the
 * editor's sun stands) casting soft
 * shadows, a sky light, SketchUp's sky and ground split at the horizon, and a plane at ground level that catches the shadows.
 * three.js divides diffuse light by π, hence the strong intensities.
 */
import * as THREE from 'three';

/** The hemisphere's share of the sky light: most of it now comes from the sky environment (environment.ts, issue 208) */
export const SKYLIGHT_INTENSITY = 0.15;
/** The whole sky light where the environment is left out (the 3D view's light setup) */
export const SKYLIGHT_WITHOUT_ENVIRONMENT = 1.6;
export const SUN_INTENSITY = 3.2;
/** The sky environment's strength: the ambient light and reflections of the scene */
export const ENVIRONMENT_INTENSITY = 0.5;
/** Exposure for the Neutral tone mapping: white walls in the sun stay white */
export const TONE_EXPOSURE = 1.0;
/** How dark the shadows are on the ground around the house */
export const GROUND_SHADOW_OPACITY = 0.28;

/** Toward the sun when no time is given: from the south-west, high */
export const DEFAULT_SUN = new THREE.Vector3(-1.2, 2, 0.9).normalize();

/** Shadow quality: the editor drops to 'low' on devices that can't keep up */
export type ShadowQuality = 'high' | 'low';

/**
 * Where the sun stands and how its shadow is set up, for a house of this centre and radius (metres). The normal bias is about two
 * shadow-map texels: less, and large flat floors shadow themselves in a fine pattern that the soft filter blurs into an even
 * darkening (one terrace darker than another of the same material).
 */
export function sunSetup(center: THREE.Vector3, radius: number, quality: ShadowQuality = 'high', toward: THREE.Vector3 = DEFAULT_SUN) {
  const mapSize = quality === 'high' ? 2048 : 1024;
  // Seen from the sun every caster lies within the house's bounding radius, and so does every shadow it casts (a shadow lies
  // on the caster's ray): the map covers just that, with a little margin (issue 208)
  const half = radius * 1.05;
  return {
    position: center.clone().addScaledVector(toward, radius * 2.5),
    mapSize,
    shadowRadius: quality === 'high' ? 10 : 4,
    bias: -0.0004,
    normalBias: ((half * 2) / mapSize) * 2,
    camera: { left: -half, right: half, top: half, bottom: -half, near: 0.5, far: radius * 10 },
  };
}

/** The sun as a light aimed at the house's centre (its target must be added to the scene too) */
export function sunLight(color: THREE.ColorRepresentation, center: THREE.Vector3, radius: number, quality?: ShadowQuality) {
  const s = sunSetup(center, radius, quality);
  const sun = new THREE.DirectionalLight(color, SUN_INTENSITY);
  sun.position.copy(s.position);
  sun.target.position.copy(center);
  sun.castShadow = true;
  sun.shadow.mapSize.set(s.mapSize, s.mapSize);
  sun.shadow.radius = s.shadowRadius;
  sun.shadow.bias = s.bias;
  sun.shadow.normalBias = s.normalBias;
  Object.assign(sun.shadow.camera, s.camera);
  sun.shadow.camera.updateProjectionMatrix();
  return sun;
}

/** A plane at the site's ground level that only catches shadows: the ground itself is drawn by the backdrop, below the horizon */
export function shadowGround(color: THREE.ColorRepresentation, size: number) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2),
    new THREE.ShadowMaterial({ color, opacity: GROUND_SHADOW_OPACITY, transparent: true, fog: false }),
  );
  ground.receiveShadow = true;
  return ground;
}

/** Which parts of SketchUp's background a style draws (Styles → Background): the sky above the horizon, the ground below it */
export interface BackdropStyle {
  sky: boolean;
  ground: boolean;
}

/** The colors of the background (CSS colors): the plain backdrop, the sky at the zenith, the haze at the horizon, the ground */
export interface BackdropColors {
  backdrop: string;
  sky: string;
  horizon: string;
  ground: string;
}

/**
 * The scene's background, as SketchUp draws it: sky and ground at infinity, split at the eye-level horizon, so looking down
 * shows only ground and a low camera shows a clear horizon line. Above the horizon the sky runs from the horizon's haze up to
 * the sky color; below it is the ground color. Either can be off (the plain backdrop shows there); with both off, the
 * background is just the backdrop. An equirectangular texture, so it turns with the camera like the world does.
 */
export function backdrop(style: BackdropStyle, colors: BackdropColors): THREE.Color | THREE.Texture {
  if (!style.sky && !style.ground) return new THREE.Color(colors.backdrop);
  const rows = 1024;
  const plain = new THREE.Color(colors.backdrop),
    sky = new THREE.Color(colors.sky),
    horizon = new THREE.Color(colors.horizon),
    ground = new THREE.Color(colors.ground);
  const c = new THREE.Color(),
    rgb = { r: 0, g: 0, b: 0 },
    data = new Uint8Array(4 * rows);
  for (let i = 0; i < rows; i++) {
    // Row 0 looks straight down, the middle row at the horizon, the last straight up
    const up = (i + 0.5) / rows - 0.5;
    if (up < 0) c.copy(style.ground ? ground : plain);
    else c.copy(style.sky ? horizon.clone().lerp(sky, THREE.MathUtils.smoothstep(up * 2, 0, 0.25)) : plain);
    c.getRGB(rgb, THREE.SRGBColorSpace);
    data.set([Math.round(rgb.r * 255), Math.round(rgb.g * 255), Math.round(rgb.b * 255), 255], i * 4);
  }
  const t = new THREE.DataTexture(data, 1, rows);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
