/**
 * The 3D view's light and backdrop, shared by the editor and the house stills: a warm white sun from the south-west casting soft
 * shadows, a sky light, SketchUp's sky and ground split at the horizon, and a plane at ground level that catches the shadows.
 * three.js divides diffuse light by π, hence the strong intensities.
 */
import * as THREE from 'three';

export const SKYLIGHT_INTENSITY = 2.4;
export const SUN_INTENSITY = 1.4;
/** How dark the shadows are on the ground around the house */
export const GROUND_SHADOW_OPACITY = 0.35;

/** Shadow quality: the editor drops to 'low' on devices that can't keep up */
export type ShadowQuality = 'high' | 'low';

/**
 * Where the sun stands and how its shadow is set up, for a house of this centre and radius (metres). The normal bias is about two
 * shadow-map texels: less, and large flat floors shadow themselves in a fine pattern that the soft filter blurs into an even
 * darkening (one terrace darker than another of the same material).
 */
export function sunSetup(center: THREE.Vector3, radius: number, quality: ShadowQuality = 'high') {
  const mapSize = quality === 'high' ? 2048 : 1024;
  return {
    position: new THREE.Vector3(center.x - radius * 1.2, center.y + radius * 2, center.z + radius * 0.9),
    mapSize,
    shadowRadius: quality === 'high' ? 6 : 3,
    bias: -0.0004,
    normalBias: ((radius * 2.8) / mapSize) * 2,
    camera: { left: -radius * 1.4, right: radius * 1.4, top: radius * 1.4, bottom: -radius * 1.4, near: 0.5, far: radius * 6 },
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
