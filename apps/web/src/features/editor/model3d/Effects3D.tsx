/**
 * Effects in the 3D view (issue 203): what the shown widgets declare as particles, fog, lights and a sky mood, fitted to the
 * host's budgets (core's fitEffects) and animated here on the GPU, so a script runs once per change and never per frame.
 * Particles are points whose shader moves them (falling with the wind, drifting, wrapping within their height band); fog,
 * lights and the sky change the scene while the effect is on. A watchdog thins particles out when frames run long, and with
 * reduced motion they hold still. Ignored by picking, edges, walking and the sun (userData.mark).
 */
import { fitEffects, type EffectItem, type Project } from '@opensu/core';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { hops } from '@/canvas/hop';
import { useCanvasDocument } from '@/canvas/CanvasFrame';
import { M } from '@/graphics/three/scene';
import { themeColor } from '@/lib/theme';
import { useWidgetOutputs } from '../widgets/outputs';

const marks = { mark: true, noEdges: true };
const none = () => null;

/** How a sky mood dims the sun and the sky light */
const MOODS = { overcast: { sun: 0.35, sky: 0.85 }, dusk: { sun: 0.3, sky: 0.5 }, night: { sun: 0.02, sky: 0.08 } } as const;

/** The sky mood the effects ask for, read by the stage (HouseStage) to dim its sun and sky light */
let mood: keyof typeof MOODS | null = null;
const listeners = new Set<() => void>();
const setMood = (m: typeof mood) => {
  if (m === mood) return;
  mood = m;
  listeners.forEach(l => l());
};
export const useSkyMood = () => {
  const m = useSyncExternalStore(
    l => (listeners.add(l), () => listeners.delete(l)),
    () => mood,
  );
  return m ? MOODS[m] : { sun: 1, sky: 1 };
};

type Particles = Extract<EffectItem, { type: 'particles' }>;

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

function ParticleSystem({ item, base, color, time }: { item: Particles; base: number; color: string; time: React.MutableRefObject<number> }) {
  const size = useThree(s => s.size);
  const { geometry, material } = useMemo(() => {
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
    return { geometry, material };
  }, [item, base, color]);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  // Points are sized in metres: pixels per metre at one metre away
  material.uniforms.uScale.value = size.height / (2 * Math.tan(THREE.MathUtils.degToRad(40) / 2));
  useFrame(() => {
    material.uniforms.uTime.value = time.current;
  });
  return <points geometry={geometry} material={material} frustumCulled={false} raycast={none} userData={marks} />;
}

export function Effects3D({ project, current }: { project: Project; current: string }) {
  const doc = useCanvasDocument();
  const outputs = useWidgetOutputs(project, current, '3d');
  const items = useMemo(() => outputs.flatMap(o => o.items), [outputs]);
  const [density, setDensity] = useState(1);
  const fitted = useMemo(() => fitEffects(items, density), [items, density]);
  const elev = useMemo(() => new Map(project.levels.map(l => [l.id, l.elevation])), [project.levels]);
  const { scene, invalidate } = useThree();
  const tone = (t: string) => themeColor(`--canvas-effect-${t}`, doc);

  // The sky's mood: the stage dims its sun and sky light; the background takes the mood's colour
  useEffect(() => {
    const m = fitted.sky?.mood ?? null;
    setMood(m);
    if (!m) return;
    const before = scene.background;
    scene.background = new THREE.Color(themeColor(`--canvas-sky-${m}`, doc));
    invalidate();
    return () => {
      scene.background = before;
      invalidate();
    };
  }, [fitted.sky?.mood]);
  useEffect(() => () => setMood(null), []);

  // Fog over the scene, its density mapped to metres of visibility
  useEffect(() => {
    if (!fitted.fog) return;
    const before = scene.fog;
    scene.fog = new THREE.FogExp2(tone(fitted.fog.tone), 0.002 + fitted.fog.density * 0.022);
    invalidate();
    return () => {
      scene.fog = before;
      invalidate();
    };
  }, [fitted.fog?.density, fitted.fog?.tone]);

  // The clock, and the watchdog: frames longer than ~40 ms on average over two seconds halve the particles (down to an eighth)
  const time = useRef(0);
  const watch = useRef({ frames: 0, spent: 0 });
  const moving = fitted.particles.length > 0;
  useFrame((_, dt) => {
    if (!moving) return;
    if (!hops.reduced) time.current += Math.min(dt, 0.1);
    const w = watch.current;
    w.frames++;
    w.spent += dt;
    if (w.spent > 2) {
      if (w.spent / w.frames > 0.04 && density > 0.125) setDensity(d => d / 2);
      w.frames = 0;
      w.spent = 0;
    }
    if (!hops.reduced) invalidate();
  });
  useEffect(() => {
    if (moving) invalidate();
  }, [moving]);

  return (
    <group userData={marks} name="effects">
      {fitted.particles.map((p, i) => (
        <ParticleSystem key={`${i}-${p.count}-${p.shape}`} item={p} base={elev.get(p.level ?? current) ?? 0} color={tone(p.tone)} time={time} />
      ))}
      {fitted.lights.map((l, i) => (
        <pointLight
          key={i}
          position={[l.at[0] * M, ((elev.get(l.level ?? current) ?? 0) + l.z) * M, l.at[1] * M]}
          color={tone(l.tone)}
          intensity={l.intensity * 12}
          distance={l.range * M}
          decay={2}
          userData={marks}
        />
      ))}
    </group>
  );
}
