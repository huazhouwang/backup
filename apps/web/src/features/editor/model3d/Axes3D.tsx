/**
 * The model axes, as SketchUp draws them: red along the plan's x (east–west), green along its y (north–south) and blue up, through
 * the origin; solid on the positive side with an arrowhead at its end, dotted on the negative. Moved or turned in the plan (see Axes
 * in the core schema), red and green follow and the world axes stay as faint dashes. Not pickable; the axes layer hides them.
 */
import { Line } from '@react-three/drei';
import { axesFrame, type Axes } from '@plinth/core';
import * as THREE from 'three';
import { useCanvasDocument } from '@/canvas/CanvasFrame';
import { themeColor } from '@/lib/theme';
import { M } from '@/graphics/three/scene';

const none = () => null;
const marks = { measure: true, noEdges: true };
const UP = new THREE.Vector3(0, 1, 0);

export function Axes3D({ reach, axes }: { reach: number; axes?: Axes }) {
  const doc = useCanvasDocument();
  const f = axesFrame(axes);
  const custom = f.angle % 360 !== 0 || f.origin[0] !== 0 || f.origin[1] !== 0;
  const o = new THREE.Vector3(f.origin[0] * M, 0, f.origin[1] * M);
  const list = [
    { v: '--axis-x', dir: new THREE.Vector3(f.x[0], 0, f.x[1]) },
    { v: '--axis-y', dir: new THREE.Vector3(f.y[0], 0, f.y[1]) },
    { v: '--axis-z', dir: UP },
  ];
  const head = reach * 0.025;
  return (
    <group>
      {custom &&
        [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)].map((dir, i) => (
          <Line
            key={i}
            points={[dir.clone().multiplyScalar(-reach), dir.clone().multiplyScalar(reach)]}
            color={themeColor(i ? '--axis-y' : '--axis-x', doc)}
            lineWidth={1}
            transparent
            opacity={0.35}
            dashed
            dashSize={0.25}
            gapSize={0.2}
            raycast={none}
            userData={marks}
          />
        ))}
      {list.map(({ v, dir }) => {
        const color = themeColor(v, doc);
        const end = o.clone().addScaledVector(dir, reach);
        return (
          <group key={v}>
            <Line points={[o, end]} color={color} lineWidth={1.5} raycast={none} userData={marks} />
            <Line
              points={[o, o.clone().addScaledVector(dir, -reach)]}
              color={color}
              lineWidth={1.5}
              dashed
              dashSize={0.25}
              gapSize={0.2}
              raycast={none}
              userData={marks}
            />
            <mesh
              position={end.clone().addScaledVector(dir, -head / 2)}
              quaternion={new THREE.Quaternion().setFromUnitVectors(UP, dir)}
              raycast={none}
              userData={marks}
            >
              <coneGeometry args={[head * 0.35, head, 16]} />
              <meshBasicMaterial color={color} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
