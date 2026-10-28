/**
 * Effect particles (issue 203) as three.js points whose shader moves them: falling (or rising) through their height band with
 * the wind and wrapping, drifting, drawn as streaks, soft flakes or pulsing glows. Positions are random but the same for the
 * same effect. Shared by the editor's 3D view (animated) and the widget stills on library pages (one moment).
 */
import type { EffectItem } from '@opensu/core';
import * as THREE from 'three';
import { M } from './scene';

export type Particles = Extract<EffectItem, { type: 'particles' }>;

/** How a sky mood dims the sun and the sky light */
export const SKY_MOOD_LIGHT = { overcast: { sun: 0.35, sky: 0.85 }, dusk: { sun: 0.3, sky: 0.5 }, night: { sun: 0.02, sky: 0.08 } } as const;

/** Pixels per metre at one metre away, for a view this tall seen with this vertical field of view (degrees) */
export const pixelsPerMetre = (height: number, fov: number) => height / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));

/** A point inside the outline, at random (rejection sampling within its bounds) */
function inside(outline: [number, number][], rnd: () => number): [number, number] {
  const xs = outline.map(p => p[0]),
    ys = outline.map(p => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  for (let tries = 0; tries < 30; tries++) {
    const p: [number, number] = [x0 + rnd() * (x1 - x0), y0 + rnd() * (y1 - y0)];
    let inPoly = false;
    for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
      const [xi, yi] = outline[i],
        [xj, yj] = outline[j];
      if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inPoly = !inPoly;
    }
    if (inPoly) return p;
  }
  return [(x0 + x1) / 2, (y0 + y1) / 2];
}

/** A small deterministic random generator, so the same effect looks the same each time */
const random = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

const VERTEX = `
uniform float uTime, uFall, uDrift, uBottom, uTop, uSize, uScale;
uniform vec2 uWind;
attribute float aSeed;
varying float vSeed;
void main() {
  vSeed = aSeed;
  vec3 p = position;
  float h = max(uTop - uBottom, 0.01);
  float age = 0.0;
  if (abs(uFall) > 0.0001) {
    // Falling (or rising) through the band and wrapping: how long since it left the top decides how far the wind took it
    float travelled = mod((uTop - p.y) + uTime * abs(uFall), h);
    age = travelled / abs(uFall);
    p.y = uFall > 0.0 ? uTop - travelled : uBottom + travelled;
    p.x += uWind.x * age;
    p.z += uWind.y * age;
  } else {
    p.y += sin(uTime * 0.7 + aSeed * 40.0) * uDrift;
  }
  p.x += sin(uTime * 1.3 + aSeed * 61.0) * uDrift * 0.5;
  p.z += cos(uTime * 1.1 + aSeed * 23.0) * uDrift * 0.5;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = max(uSize * uScale / max(-mv.z, 0.1), 1.5);
  gl_Position = projectionMatrix * mv;
}`;

const FRAGMENT = `
uniform vec3 uColor;
uniform float uShape, uTime;
varying float vSeed;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a;
  if (uShape < 0.5) a = (1.0 - smoothstep(0.02, 0.06, abs(c.x))) * (1.0 - smoothstep(0.35, 0.5, abs(c.y))) * 0.55;  // streak
  else if (uShape < 1.5) a = 1.0 - smoothstep(0.25, 0.5, length(c));                                                // flake
  else a = (1.0 - smoothstep(0.0, 0.5, length(c))) * (0.55 + 0.45 * sin(uTime * 2.0 + vSeed * 30.0));                // glow
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
}`;

const SHAPES = { streak: 0, flake: 1, glow: 2 };

/** The points for a particles item on a level at `base` (mm): set uniforms uTime to move them and uScale (pixelsPerMetre) to size them */
export function particlePoints(item: Particles, base: number, color: string): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const rnd = random(item.count * 7919 + Math.round(item.outline[0][0]));
  const pos = new Float32Array(item.count * 3),
    seeds = new Float32Array(item.count);
  const bottom = (base + item.from) * M,
    top = (base + item.to) * M;
  for (let i = 0; i < item.count; i++) {
    const [x, y] = inside(item.outline, rnd);
    pos.set([x * M, bottom + rnd() * (top - bottom), y * M], i * 3);
    seeds[i] = rnd();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: item.shape === 'glow' ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 },
      uFall: { value: item.fall },
      uDrift: { value: item.drift ?? 0 },
      uWind: { value: new THREE.Vector2(...(item.wind ?? [0, 0])) },
      uBottom: { value: bottom },
      uTop: { value: top },
      uSize: { value: (item.size / 1000) * (item.shape === 'streak' ? 1 : 1.6) },
      uScale: { value: 1 },
      uColor: { value: new THREE.Color(color) },
      uShape: { value: SHAPES[item.shape] },
    },
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}
