/** What the house stands in, in the 3D view: sky light, the sun, and a ground that only catches shadows (see scene/lighting.ts) */
import type { Project } from '@opensu/core';
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { hops } from '@/canvas/hop';
import { useSkyMood } from './Effects3D';
import {
  DEFAULT_SUN,
  ENVIRONMENT_INTENSITY,
  M,
  shadowGround,
  siteBounds,
  SKYLIGHT_INTENSITY,
  SKYLIGHT_WITHOUT_ENVIRONMENT,
  skyEnvironment,
  SUN_INTENSITY,
  sunColor,
  sunLight,
  sunSetup,
  type ShadowQuality,
} from '@/graphics/three/scene';
import { disposePlants } from '@/graphics/three/plants';
import { hazeRange, treeLine } from '@/graphics/three/setting';

export function HouseStage({
  project,
  center,
  radius,
  span,
  quality,
  colors,
  toward,
  strength = 1,
}: {
  project: Project;
  center: THREE.Vector3;
  radius: number;
  /** The site's larger side in metres: the ground reaches well beyond it and the house */
  span: number;
  quality: ShadowQuality;
  colors: { skylight: string; wall: string; sun: string; sunLow: string; shadow: string; sky: string; skyLight: string; ground: string; backdrop: string };
  /** Toward the sun (see lib/solar.ts), and how strong it shines (0–1, low near the horizon) */
  toward?: THREE.Vector3;
  strength?: number;
}) {
  // A shadow map keeps its size once created: a new sun when the quality changes
  const sun = useMemo(() => sunLight(colors.sun, center, radius, quality), [colors.sun, center.x, center.y, center.z, radius, quality]);
  useEffect(() => () => sun.shadow.map?.dispose(), [sun]);
  // While a house just built goes up (issue 188) the sun casts no shadows: they come back once it stands
  const casts = useMemo(() => sun.castShadow, [sun]);
  useFrame(({ invalidate: again }) => {
    const on = casts && !hops.buildActive;
    if (sun.castShadow !== on) {
      sun.castShadow = on;
      again();
    }
  });
  // The sun moves with the chosen day and time; an effect's sky (overcast, dusk, night: issue 203) dims it and the sky light
  const invalidate = useThree(s => s.invalidate);
  const mood = useSkyMood();
  useEffect(() => {
    sun.position.copy(sunSetup(center, radius, quality, toward).position);
    sun.color.copy(sunColor(colors.sun, colors.sunLow, toward ?? DEFAULT_SUN));
    sun.intensity = SUN_INTENSITY * strength * mood.sun;
    invalidate();
  }, [sun, toward?.x, toward?.y, toward?.z, strength, mood.sun, colors.sunLow]);
  // The sky as image-based light (issue 208): soft shading by the sky's direction, and reflections in glass and glossy finishes.
  // Sampling it costs every pixel, so the light setup goes without and takes more from the sky light instead
  const { gl, scene } = useThree();
  const lit = quality === 'high';
  const env = useMemo(
    () => (lit ? skyEnvironment(gl, { sky: colors.skyLight, horizon: colors.backdrop, ground: colors.ground, sun: colors.sun }, toward ?? DEFAULT_SUN) : null),
    [lit, gl, colors.skyLight, colors.backdrop, colors.ground, colors.sun, toward?.x, toward?.y, toward?.z],
  );
  useEffect(() => {
    scene.environment = env;
    invalidate();
    return () => {
      if (scene.environment === env) scene.environment = null;
      env?.dispose();
    };
  }, [env]);
  useEffect(() => {
    scene.environmentIntensity = ENVIRONMENT_INTENSITY * mood.sky;
    invalidate();
  }, [mood.sky]);
  const [cx, cz] = useMemo(() => {
    const [x0, y0, x1, y1] = siteBounds(project);
    return [((x0 + x1) / 2) * M, ((y0 + y1) / 2) * M];
  }, [project.site.boundary]);
  const ground = useMemo(() => shadowGround(colors.shadow, Math.max(span, radius) * 40), [colors.shadow, span, radius]);
  useEffect(
    () => () => {
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
    },
    [ground],
  );
  // In a landscape (issue 220): a tree line on the horizon, fading into a haze that starts just past the house from wherever the
  // camera stands. An effect's fog (Effects3D) replaces the haze while it is on
  const [setting, setSetting] = useState<THREE.Group | null>(null);
  useEffect(() => {
    let live = true,
      got: THREE.Group | null = null;
    void treeLine(center, radius).then(g => {
      got = g;
      if (live) {
        setSetting(g);
        invalidate();
      } else disposePlants(g);
    });
    return () => {
      live = false;
      disposePlants(got);
    };
  }, [center.x, center.z, radius]);
  const haze = useMemo(() => new THREE.Fog(colors.backdrop, 1, 2), [colors.backdrop]);
  useEffect(() => {
    if (!scene.fog) scene.fog = haze;
    return () => {
      if (scene.fog === haze) scene.fog = null;
    };
  }, [haze]);
  useFrame(({ camera }) => {
    [haze.near, haze.far] = hazeRange(camera.position.distanceTo(center), radius);
  });
  // The house stands on the site's ground, which catches its shadow just below the ground-floor walls and paving
  const groundY = project.site.groundLevel * M - 0.001;
  return (
    <>
      {/* A warm white sun and sky: lit faces are white, shadows a soft warm gray */}
      <hemisphereLight args={[colors.skylight, colors.wall, (lit ? SKYLIGHT_INTENSITY : SKYLIGHT_WITHOUT_ENVIRONMENT) * mood.sky]} />
      <primitive object={sun} />
      <primitive object={sun.target} />
      <primitive object={ground} position={[cx, groundY, cz]} />
      {setting && <primitive object={setting} position-y={project.site.groundLevel * M} />}
    </>
  );
}
