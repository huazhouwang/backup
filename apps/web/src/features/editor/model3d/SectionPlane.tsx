/**
 * A section plane, as SketchUp's: the model cut across a line drawn in the plan, everything on the viewer's side (the line's
 * right-hand side) clipped away, the walls and floors it cuts filled solid (see section.ts) and the levels marked on the cut as
 * datum lines with their elevations. The orbit view stays: turn around the cut freely.
 */
import { Html, Line } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Point } from '@opensu/core';
import { useCanvasDocument } from '@/canvas/CanvasFrame';
import { themeColor } from '@/lib/theme';
import { elevationLabel, sectionAxes, sectionCuts } from '@/graphics/three/section';
import { M } from '@/graphics/three/scene';
import { useEditor } from '../store';

export function SectionPlane({ section, box }: { section: { a: Point; b: Point }; box: THREE.Box3 }) {
  const project = useEditor(s => s.project);
  const { gl, invalidate } = useThree();
  const ink = themeColor('--foreground', useCanvasDocument());
  const { d, n } = sectionAxes(section);
  const v = new THREE.Vector3(n[0], 0, n[1]);
  const dir = new THREE.Vector3(d[0], 0, d[1]);
  const origin = new THREE.Vector3(section.a[0] * M, 0, section.a[1] * M);

  // Everything on the viewer's side of the line is clipped away
  useEffect(() => {
    gl.clippingPlanes = [new THREE.Plane(v.clone().negate(), origin.dot(v))];
    invalidate();
    return () => {
      gl.clippingPlanes = [];
      invalidate();
    };
  }, [section, gl]);

  const cuts = useMemo(() => sectionCuts(project, section), [project, section]);
  const facing = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), v);
  // The datums run along the cut across the house, a little beyond it
  const corners = [box.min, box.max].flatMap(x => [box.min, box.max].map(z => new THREE.Vector3(x.x, 0, z.z)));
  const along = corners.map(c => c.clone().sub(origin).dot(dir));
  const [s0, s1] = [Math.min(...along) - 0.5, Math.max(...along) + 0.5];
  const at = (s: number, y: number) => origin.clone().add(dir.clone().multiplyScalar(s)).setY(y).add(v.clone().multiplyScalar(-0.002));

  return (
    <>
      {/* The cut walls and floors, filled solid on the plane, a hair behind it so they aren't clipped */}
      {cuts.map((c, i) => (
        <mesh key={i} position={at(((c.s0 + c.s1) / 2) * M, ((c.y0 + c.y1) / 2) * M)} quaternion={facing} userData={{ noEdges: true }} renderOrder={5}>
          <planeGeometry args={[(c.s1 - c.s0) * M, (c.y1 - c.y0) * M]} />
          <meshBasicMaterial color={ink} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {project.levels.map(l => {
        const y = l.elevation * M;
        return (
          <group key={l.id}>
            <Line points={[at(s0, y), at(s1, y)]} color={ink} lineWidth={1} dashed dashSize={0.3} gapSize={0.15} userData={{ noEdges: true }} />
            {/* The label sits on the line's start, above it */}
            <Html position={at(s0, y)} zIndexRange={[20, 10]} style={{ transform: 'translate(0, -100%)', pointerEvents: 'none' }}>
              <div style={{ font: '11px var(--font-mono)', color: 'var(--foreground)', whiteSpace: 'nowrap', paddingBottom: 2 }}>
                {elevationLabel(l.elevation)} {l.name}
              </div>
            </Html>
          </group>
        );
      })}
    </>
  );
}
