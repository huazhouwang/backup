/**
 * Image-based light for the 3D view and the stills (issue 208): the sky the house stands under, as an environment every material
 * takes its ambient light and reflections from. A procedural sky (ground below the horizon, haze at the horizon, the sky above,
 * a bright sun) rendered into a cube and prefiltered with PMREM, so walls shade softly with the sky's direction and glass and
 * glossy finishes reflect it. No image file to load: the colours are the theme's.
 */
import * as THREE from 'three';

export interface SkyColors {
  sky: string;
  horizon: string;
  ground: string;
  sun: string;
}

/** How much brighter the sun's disc is than white: it is what gives glossy surfaces their highlight */
const SUN_RADIANCE = 30;

const VERTEX = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAGMENT = `
uniform vec3 uSky, uHorizon, uGround, uSun, uToward;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float up = d.y;
  // The ground darkens a little toward the nadir; the sky deepens from the haze at the horizon toward its colour above, only
  // partly, so the shaded side of a white wall reads cool rather than blue
  vec3 c = up < 0.0 ? mix(uHorizon, uGround, smoothstep(0.0, 0.08, -up)) * mix(1.0, 0.75, smoothstep(0.0, 1.0, -up))
                    : mix(uHorizon, uSky, 0.6 * smoothstep(0.0, 0.45, up));
  // The sun's disc and its glow
  float s = max(dot(d, normalize(uToward)), 0.0);
  c += uSun * (smoothstep(0.9995, 0.99975, s) * ${SUN_RADIANCE.toFixed(1)} + pow(s, 64.0) * 0.6);
  gl_FragColor = vec4(c, 1.0);
}`;

/** The environment for a sky of these colours with the sun toward `toward`; dispose it when the colours or the sun change */
export function skyEnvironment(renderer: THREE.WebGLRenderer, colors: SkyColors, toward: THREE.Vector3): THREE.Texture {
  const linear = (c: string) => new THREE.Color(c);
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uSky: { value: linear(colors.sky) },
      uHorizon: { value: linear(colors.horizon) },
      uGround: { value: linear(colors.ground) },
      uSun: { value: linear(colors.sun) },
      uToward: { value: toward.clone().normalize() },
    },
  });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), material);
  const scene = new THREE.Scene();
  scene.add(sphere);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0.02);
  pmrem.dispose();
  sphere.geometry.dispose();
  material.dispose();
  return target.texture;
}
