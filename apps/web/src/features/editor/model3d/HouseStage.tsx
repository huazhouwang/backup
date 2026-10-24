/** What the house stands in, in the 3D view: sky light, the sun, and a ground that only catches shadows (see scene/lighting.ts) */
import type { Project } from '@plinth/core';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { M, shadowGround, siteBounds, SKYLIGHT_INTENSITY, sunLight, type ShadowQuality } from '@/graphics/three/scene';

export function HouseStage({
  project,
  center,
  radius,
  span,
  quality,
  colors,
}: {
  project: Project;
  center: THREE.Vector3;
  radius: number;
  /** The site's larger side in metres: the ground reaches well beyond it and the house */
  span: number;
  quality: ShadowQuality;
  colors: { skylight: string; wall: string; sun: string; shadow: string };
}) {
  // A shadow map keeps its size once created: a new sun when the quality changes
  const sun = useMemo(() => sunLight(colors.sun, center, radius, quality), [colors.sun, center.x, center.y, center.z, radius, quality]);
  useEffect(() => () => sun.shadow.map?.dispose(), [sun]);
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
  // The house stands on the site's ground, which catches its shadow just below the ground-floor walls and paving
  const groundY = project.site.groundLevel * M - 0.001;
  return (
    <>
      {/* A warm white sun and sky: lit faces are white, shadows a soft warm gray */}
      <hemisphereLight args={[colors.skylight, colors.wall, SKYLIGHT_INTENSITY]} />
      <primitive object={sun} />
      <primitive object={sun.target} />
      <primitive object={ground} position={[cx, groundY, cz]} />
    </>
  );
}
