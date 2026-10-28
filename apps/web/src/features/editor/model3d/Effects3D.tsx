/**
 * Effects in the 3D view (issue 203): what the shown widgets declare as particles, fog, lights and a sky mood, fitted to the
 * host's budgets (core's fitEffects) and animated here on the GPU, so a script runs once per change and never per frame.
 * Particles are points whose shader moves them (falling with the wind, drifting, wrapping within their height band); fog,
 * lights and the sky change the scene while the effect is on. A watchdog thins particles out when frames run long, and with
 * reduced motion they hold still. Ignored by picking, edges, walking and the sun (userData.mark).
 */
import { fitEffects, type Project } from '@opensu/core';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { hops } from '@/canvas/hop';
import { useCanvasDocument } from '@/canvas/CanvasFrame';
import { FOV } from '@/graphics/three/framing';
import { particlePoints, pixelsPerMetre, SKY_MOOD_LIGHT, type Particles } from '@/graphics/three/particles';
import { M } from '@/graphics/three/scene';
import { themeColor } from '@/lib/theme';
import { useWidgetOutputs } from '../widgets/outputs';

const marks = { mark: true, noEdges: true };
const none = () => null;

/** The sky mood the effects ask for, read by the stage (HouseStage) to dim its sun and sky light */
let mood: keyof typeof SKY_MOOD_LIGHT | null = null;
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
  return m ? SKY_MOOD_LIGHT[m] : { sun: 1, sky: 1 };
};

function ParticleSystem({ item, base, color, time }: { item: Particles; base: number; color: string; time: React.MutableRefObject<number> }) {
  const size = useThree(s => s.size);
  const points = useMemo(() => particlePoints(item, base, color), [item, base, color]);
  useEffect(
    () => () => {
      points.geometry.dispose();
      points.material.dispose();
    },
    [points],
  );
  points.material.uniforms.uScale.value = pixelsPerMetre(size.height, FOV);
  useFrame(() => {
    points.material.uniforms.uTime.value = time.current;
  });
  return <primitive object={points} raycast={none} userData={marks} />;
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
