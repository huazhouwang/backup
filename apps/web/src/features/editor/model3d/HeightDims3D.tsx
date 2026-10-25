/**
 * The 3D view's vertical dimensions, as on an elevation drawing (see elevationDimensions): the chains stand upright at the drawing's
 * bottom-right corner (the one the default view looks at), in the plane of the bottom façade, on the lines of the right side's
 * ground chains, so they read as those chains turning up. Drawn by the plan's own code on a sheet, rasterized like the ground chains (GroundDimensions): the same lines, ticks
 * and type, scaling with the model; the floor levels and the grade carry the drawing elevation mark. They stay put as the view
 * turns, and are seen from the front (from behind, the house hides them).
 */
import type { Project } from '@plinth/core';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useCanvasDocument } from '@/canvas/CanvasFrame';
import { elevationDimensions, elevationText } from '@/graphics/plan/dimensions';
import { levelShapes, planFrame } from '@/graphics/plan/plan-geometry';
import { PlanDimensions, type Line } from '@/graphics/plan/PlanDrawing';
import { markup } from '@/graphics/plan/markup';
import { M } from '@/graphics/three/scene';
import { useBuildsVersion } from '@/lib/builds';
import { paperOpacity, rasterize, TEXTURE_PX } from './FloorDrawing';
import type { Quality } from './Renderer';

/**
 * A floor level's elevation as drawings mark it: a right-angled triangle with its tip on the level, a tail out to the right, the
 * elevation on the tail. The outdoor grade's triangle is filled and hangs below its line, clear of the ground floor's just above it.
 */
function ElevationMark({ x, y, size, text, grade, line }: { x: number; y: number; size: number; text: string; grade?: boolean; line: Line }) {
  const t = size * 0.5;
  const s = grade ? 1 : -1;
  const tail = x + t + size * 4.6;
  return (
    <g>
      <path
        d={`M${x},${y}L${x - t},${y + s * t}L${x + t},${y + s * t}Z`}
        fill={grade ? 'var(--foreground)' : 'none'}
        stroke="var(--foreground)"
        {...line(0.6)}
      />
      <line x1={x - t} y1={y + s * t} x2={tail} y2={y + s * t} stroke="var(--foreground)" {...line(0.6)} />
      <text
        x={x + t + size * 0.3}
        y={y + s * (t + size * 0.2)}
        dominantBaseline={grade ? 'hanging' : 'alphabetic'}
        fontFamily="var(--font-mono)"
        fontSize={size}
        fill="var(--foreground)"
      >
        {text}
      </text>
    </g>
  );
}

export function HeightDims3D({
  project,
  level,
  shown,
  quality,
  growth,
}: {
  project: Project;
  /** The current floor, whose chains lie on the ground: these stand on their lines */
  level: string;
  shown: string[];
  quality: Quality;
  growth: React.RefObject<{ g: number }>;
}) {
  const doc = useCanvasDocument();
  const size = useThree(s => s.size);
  const builds = useBuildsVersion();
  const shapes = useMemo(() => levelShapes(project, level), [project, level, builds]);
  const frame = planFrame(project, level, size);
  const mmPerPx = Math.max(frame.w / size.width, frame.h / size.height);
  const key = shown.join();
  const { size: textSize, step } = frame.dims!;
  const [, , x1, bottom] = shapes.bounds;
  const dims = useMemo(() => elevationDimensions(project, key.split(','), x1, { size: textSize, step }), [project, key, x1, textSize, step]);

  // The sheet: from the drawing's right edge to beyond the elevation marks, from below the grade to above the top
  const outer = dims.chains.length ? dims.chains[dims.chains.length - 1].origin[0] : x1;
  const markAt = outer + step * 0.6;
  const sheet = {
    x: x1,
    y: -dims.top - textSize * 2,
    w: markAt + textSize * 6 - x1,
    h: dims.top - dims.grade + textSize * 4.5,
  };
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!dims.chains.length) return;
    const px = TEXTURE_PX[quality].ink;
    const k = px / Math.max(sheet.w, sheet.h);
    const [w, h] = [Math.round(sheet.w * k), Math.round(sheet.h * k)];
    const texel = 1 / k;
    // As the ground chains: the plan's screen widths, at least a texel and a half so they don't shimmer
    const line: Line = (width, dash) => ({ strokeWidth: Math.max(width * mmPerPx, texel * 1.5), strokeDasharray: dash?.map(d => d * mmPerPx).join(' ') });
    const svg = markup(
      <svg xmlns="http://www.w3.org/2000/svg" viewBox={`${sheet.x} ${sheet.y} ${sheet.w} ${sheet.h}`} width={w} height={h}>
        <PlanDimensions chains={dims.chains} size={textSize} line={line} halo={false} />
        {dims.levels.map(l => (
          <ElevationMark key={l.at} x={markAt} y={0 - l.at} size={textSize} text={elevationText(l.at)} line={line} />
        ))}
        <ElevationMark x={markAt} y={0 - dims.grade} size={textSize} text={elevationText(dims.grade)} grade line={line} />
      </svg>,
      doc,
    );
    let live = true;
    let made: THREE.Texture | null = null;
    void rasterize(svg, w, h, doc).then(t => {
      made = t;
      if (live) setTexture(t);
      else t.dispose();
    });
    return () => {
      live = false;
      made?.dispose();
    };
  }, [dims, quality, mmPerPx, doc, sheet.x, sheet.y, sheet.w, sheet.h, markAt, textSize]);

  const material = useRef<THREE.MeshBasicMaterial>(null);
  const mesh = useRef<THREE.Mesh>(null);
  useFrame(() => {
    // Comes in with the ground chains as the house grows
    const f = 1 - paperOpacity(growth.current.g);
    if (material.current) material.current.opacity = f;
    if (mesh.current) mesh.current.visible = f > 0;
  });

  if (!texture || !dims.chains.length) return null;
  return (
    <>
      <mesh
        ref={mesh}
        // In the plane of the bottom façade, facing out of it; the sheet's y is the height pointing down
        position={[(sheet.x + sheet.w / 2) * M, -(sheet.y + sheet.h / 2) * M, bottom * M]}
        raycast={() => null}
        userData={{ mark: true, noEdges: true }}
        renderOrder={1}
      >
        <planeGeometry args={[sheet.w * M, sheet.h * M]} />
        <meshBasicMaterial ref={material} map={texture} transparent depthWrite={false} toneMapped={false} fog={false} />
      </mesh>
      {/* What the sheet shows, for tests: the drawing is a texture */}
      <Html>
        <div hidden data-height-sheet={`${Math.round(sheet.x)},${Math.round(bottom)}`}>
          {dims.chains.flatMap((c, k) => c.marks.slice(1).map((t, i) => <span key={`${k}-${i}`} data-height-dim={Math.round(t - c.marks[i])} />))}
          {[...dims.levels.map(l => l.at), dims.grade].map(mm => (
            <span key={mm} data-elevation={elevationText(mm)} />
          ))}
        </div>
      </Html>
    </>
  );
}
