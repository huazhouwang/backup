/**
 * The model axes, as SketchUp draws them: red along the plan's x (east–west), green along its y (north–south) and blue up, through
 * the project origin; solid on the positive side, dotted on the negative. Not pickable; the axes layer hides them.
 */
import { Line } from '@react-three/drei';
import { useCanvasDocument } from '@/canvas/CanvasFrame';
import { themeColor } from '@/lib/theme';

const AXES = [
  { v: '--axis-x', dir: [1, 0, 0] },
  { v: '--axis-y', dir: [0, 0, 1] },
  { v: '--axis-z', dir: [0, 1, 0] },
] as const;

const none = () => null;

export function Axes3D({ reach }: { reach: number }) {
  const doc = useCanvasDocument();
  return (
    <group>
      {AXES.map(({ v, dir }) => {
        const color = themeColor(v, doc);
        const end = dir.map(d => d * reach) as [number, number, number];
        const back = dir.map(d => -d * reach) as [number, number, number];
        return (
          <group key={v}>
            <Line points={[[0, 0, 0], end]} color={color} lineWidth={1.5} raycast={none} userData={{ measure: true, noEdges: true }} />
            <Line
              points={[[0, 0, 0], back]}
              color={color}
              lineWidth={1.5}
              dashed
              dashSize={0.25}
              gapSize={0.2}
              raycast={none}
              userData={{ measure: true, noEdges: true }}
            />
          </group>
        );
      })}
    </group>
  );
}
