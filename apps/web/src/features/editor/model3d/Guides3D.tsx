/**
 * Guides in the 3D view (see Guide in the core schema): dashed lines without end (drawn far beyond the house) and small crosses for
 * points, blue while selected. Not pickable; the tape measure snaps to them (see Measure3D).
 */
import { Line } from '@react-three/drei';
import type { Guide } from '@plinth/core';
import * as THREE from 'three';
import { useCanvasDocument } from '@/canvas/CanvasFrame';
import { M } from '@/graphics/three/scene';
import { themeColor } from '@/lib/theme';

const none = () => null;

/** A guide in three.js coordinates: x east, y up, z the plan's y */
export const guideIn3D = (g: Guide) => ({
  at: new THREE.Vector3(g.at[0] * M, g.at[2] * M, g.at[1] * M),
  dir: g.dir ? new THREE.Vector3(g.dir[0], g.dir[2], g.dir[1]).normalize() : undefined,
});

export function Guides3D({ guides, selected, reach }: { guides: Guide[]; selected: Set<string>; reach: number }) {
  const doc = useCanvasDocument();
  const plain = themeColor('--muted-foreground', doc),
    blue = themeColor('--chart-2', doc);
  return (
    <group>
      {guides.map(g => {
        const { at, dir } = guideIn3D(g);
        const color = selected.has(g.id) ? blue : plain;
        if (dir)
          return (
            <Line
              key={g.id}
              points={[at.clone().addScaledVector(dir, -reach), at.clone().addScaledVector(dir, reach)]}
              color={color}
              lineWidth={1.2}
              dashed
              dashSize={0.3}
              gapSize={0.2}
              raycast={none}
              userData={{ measure: true, noEdges: true }}
            />
          );
        const r = 0.12;
        return (
          <group key={g.id} position={at}>
            {[
              [r, 0, 0],
              [0, r, 0],
              [0, 0, r],
            ].map((v, i) => (
              <Line
                key={i}
                points={[new THREE.Vector3(...v).negate(), new THREE.Vector3(...v)]}
                color={color}
                lineWidth={1.5}
                raycast={none}
                userData={{ measure: true, noEdges: true }}
              />
            ))}
          </group>
        );
      })}
    </group>
  );
}
