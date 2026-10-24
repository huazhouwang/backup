/**
 * The plan printed on a floor in 3D, drawn by the plan's own code (PlanDrawing), so on entering 3D the flat house is exactly the
 * plan and grows out of it. Two layers: paper (site boundary, room floors, the current floor's dimensions; and with it a sheet of
 * the plan's background around the drawing) fades out first as the house rises, then ink (walls, furniture, doors, labels): the built house shows its own floors,
 * furniture and walls. Both are unlit, so their colors are the plan's. Line widths are the plan's screen widths at the scale the plan
 * is shown, converted to millimetres.
 */
import type { Project } from '@plinth/core';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useCanvasDocument } from '@/canvas/CanvasFrame';
import { exteriorDimensions } from '@/graphics/plan/dimensions';
import { dimensionStep, labelSize, levelShapes, planFrame } from '@/graphics/plan/plan-geometry';
import { PlanDefs, PlanDimensions, PlanInk, PlanLabels, PlanPaper, scaledLine } from '@/graphics/plan/PlanDrawing';
import type { Quality } from './Renderer';
import { useBuildsVersion } from '@/lib/builds';
import { M } from '@/graphics/three/scene';
import { markup } from '@/graphics/plan/markup';

/**
 * Texture size along the longer side of the drawing. A budget, since phone browsers kill pages that hold too much image memory
 * (4096-pixel textures for two layers on four floors took about 600 MB): the current floor's ink is sharpest; other floors' ink and
 * all paper (seen only while the house grows, and soft-edged) are smaller; low-end phones get half.
 */
const TEXTURE_PX = {
  high: { ink: 2048, otherInk: 1024, paper: 1024 },
  low: { ink: 1024, otherInk: 512, paper: 512 },
};

/** How opaque the paper is while the house grows (g: 0 flat, 1 built): gone once the walls are a third of the way up */
export const paperOpacity = (g: number) => 1 - THREE.MathUtils.smoothstep(g, 0, 0.3);
/** The ink fades after the paper, gone before the walls are fully up */
const inkOpacity = (g: number) => 1 - THREE.MathUtils.smoothstep(g, 0.3, 0.8);

async function rasterize(svg: string, width: number, height: number, doc: Document) {
  const img = new doc.defaultView!.Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const c = doc.createElement('canvas');
  c.width = width;
  c.height = height;
  c.getContext('2d')!.drawImage(img, 0, 0, width, height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** The level's drawing, just above its floor (the parent places it at the level's elevation). Ignored by picking. */
export function FloorDrawing({
  project,
  level,
  current,
  furniture,
  labels,
  dimensions,
  quality,
  growth,
}: {
  project: Project;
  level: string;
  current: boolean;
  furniture: boolean;
  labels: boolean;
  dimensions: boolean;
  quality: Quality;
  growth: React.RefObject<{ g: number }>;
}) {
  const doc = useCanvasDocument();
  const size = useThree(s => s.size);
  const builds = useBuildsVersion();
  const shapes = useMemo(() => levelShapes(project, level), [project, level, builds]);
  const frame = planFrame(project, level, dimensions);
  // The plan's scale on screen (it fits the framing to the view), for line widths
  const mmPerPx = Math.max(frame.w / size.width, frame.h / size.height);
  const [textures, setTextures] = useState<{ paper: THREE.Texture; ink: THREE.Texture } | null>(null);

  useEffect(() => {
    const line = scaledLine(mmPerPx);
    const svg = (children: React.ReactNode, w: number, h: number) =>
      markup(
        <svg xmlns="http://www.w3.org/2000/svg" viewBox={`${frame.x} ${frame.y} ${frame.w} ${frame.h}`} width={w} height={h}>
          {children}
        </svg>,
        doc,
      );
    const budget = TEXTURE_PX[quality];
    const dims = (px: number) => {
      const k = px / Math.max(frame.w, frame.h);
      return [Math.round(frame.w * k), Math.round(frame.h * k)] as const;
    };
    const [pw, ph] = dims(budget.paper);
    const [iw, ih] = dims(current ? budget.ink : budget.otherInk);
    let live = true;
    let made: { paper: THREE.Texture; ink: THREE.Texture } | null = null;
    void Promise.all([
      rasterize(
        svg(
          <>
            <PlanDefs project={project} />
            <PlanPaper project={project} level={level} shapes={shapes} line={line} />
            {dimensions && current && (
              <PlanDimensions
                chains={exteriorDimensions(project, level, shapes.bounds, dimensionStep(labelSize(shapes.bounds)))}
                font={labelSize(shapes.bounds)}
                line={line}
              />
            )}
          </>,
          pw,
          ph,
        ),
        pw,
        ph,
        doc,
      ),
      rasterize(
        svg(
          <>
            <PlanDefs project={project} />
            <PlanInk shapes={shapes} furniture={furniture} line={line} />
            {labels && <PlanLabels shapes={shapes} />}
          </>,
          iw,
          ih,
        ),
        iw,
        ih,
        doc,
      ),
    ]).then(([paper, ink]) => {
      made = { paper, ink };
      if (live) setTextures(made);
      else {
        paper.dispose();
        ink.dispose();
      }
    });
    return () => {
      live = false;
      made?.paper.dispose();
      made?.ink.dispose();
    };
  }, [shapes, furniture, labels, dimensions, quality, current, mmPerPx, doc]);

  const paper = useRef<THREE.MeshBasicMaterial>(null);
  const paperMesh = useRef<THREE.Mesh>(null);
  const ink = useRef<THREE.MeshBasicMaterial>(null);
  const inkMesh = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const f = paperOpacity(growth.current.g),
      k = inkOpacity(growth.current.g);
    if (paper.current) paper.current.opacity = f;
    if (paperMesh.current) paperMesh.current.visible = f > 0;
    if (ink.current) ink.current.opacity = k;
    if (inkMesh.current) inkMesh.current.visible = k > 0;
  });

  if (!textures) return null;
  const center: [number, number] = [(frame.x + frame.w / 2) * M, (frame.y + frame.h / 2) * M];
  return (
    <group>
      <mesh
        ref={paperMesh}
        position={[center[0], 0.005, center[1]]}
        rotation={[-Math.PI / 2, 0, 0]}
        raycast={() => null}
        userData={{ noEdges: true }}
        renderOrder={2}
      >
        <planeGeometry args={[frame.w * M, frame.h * M]} />
        <meshBasicMaterial ref={paper} map={textures.paper} transparent depthWrite={false} toneMapped={false} fog={false} />
      </mesh>
      <mesh
        ref={inkMesh}
        position={[center[0], 0.006, center[1]]}
        rotation={[-Math.PI / 2, 0, 0]}
        raycast={() => null}
        userData={{ noEdges: true }}
        renderOrder={3}
      >
        <planeGeometry args={[frame.w * M, frame.h * M]} />
        <meshBasicMaterial ref={ink} map={textures.ink} transparent depthWrite={false} toneMapped={false} fog={false} />
      </mesh>
    </group>
  );
}

/**
 * The plan's background around the drawing, as far as the view reaches: with the paper it makes the flat house look exactly like
 * the plan (white page, no backdrop or plinth), and fades out with it.
 */
export function PlanSheet({ center, size, color, growth }: { center: [number, number]; size: number; color: string; growth: React.RefObject<{ g: number }> }) {
  const material = useRef<THREE.MeshBasicMaterial>(null);
  const mesh = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const f = paperOpacity(growth.current.g);
    if (material.current) material.current.opacity = f;
    if (mesh.current) mesh.current.visible = f > 0;
  });
  return (
    <mesh ref={mesh} position={[center[0], 0.004, center[1]]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null} userData={{ noEdges: true }} renderOrder={1}>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial ref={material} color={color} transparent depthWrite={false} toneMapped={false} fog={false} />
    </mesh>
  );
}
