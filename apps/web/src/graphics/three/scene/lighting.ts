/**
 * The 3D view's light and backdrop, shared by the editor and the house stills: a warm white sun from the south-west casting soft
 * shadows, a sky light, SketchUp's sky gradient, and a ground that only catches shadows. three.js divides diffuse light by π,
 * hence the strong intensities.
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

/** The ground only catches shadows: the house stands on the backdrop (or the sky's horizon) with its shadow, on no board */
export function shadowGround(color: THREE.ColorRepresentation, size: number) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2),
    new THREE.ShadowMaterial({ color, opacity: GROUND_SHADOW_OPACITY, transparent: true, fog: false }),
  );
  ground.receiveShadow = true;
  return ground;
}

/** SketchUp's sky: a vertical gradient from the sky color at the top to the backdrop at the horizon */
export function skyTexture(sky: string, horizon: string) {
  const data = new Uint8Array(4 * 64);
  const a = new THREE.Color(sky),
    b = new THREE.Color(horizon),
    c = new THREE.Color();
  for (let i = 0; i < 64; i++) {
    // Row 0 is the bottom of the screen: the horizon color up to the middle, then the sky
    c.copy(b).lerp(a, THREE.MathUtils.smoothstep(i / 63, 0.35, 1));
    data.set([Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255), 255], i * 4);
  }
  const t = new THREE.DataTexture(data, 1, 64);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
