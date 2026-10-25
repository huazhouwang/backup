/**
 * The 3D view's vertical dimensions, as on an elevation drawing (see heightDimensions): three chains standing beside the corner of
 * the house nearest the camera, along the façade that faces it more, from the building outwards (detail, storeys, overall), and
 * the floor levels' elevations beyond them. They switch corner as the view turns. Lines, ticks and type as the plan's dimensions;
 * the values are DOM labels, so they always face the screen, written along the chains.
 */
import { Html, Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useCanvasDocument } from '@/canvas/CanvasFrame';
import { elevationText, heightDimensions, type Side } from '@/graphics/plan/dimensions';
import { M } from '@/graphics/three/scene';
import { themeColor } from '@/lib/theme';
import { useEditor } from '../store';

const none = () => null;
const marks = { mark: true, noEdges: true };
/** A value is written only where its segment is at least this tall (mm), as the plan leaves out what it can't fit */
const MIN_TEXT = 450;

type Corner = { x: 'min' | 'max'; z: 'min' | 'max'; side: Side };

export function HeightDims3D({ box, shown }: { box: THREE.Box3; shown: string[] }) {
  const project = useEditor(s => s.project);
  const ink = themeColor('--foreground', useCanvasDocument());
  const [corner, setCorner] = useState<Corner | null>(null);
  const now = useRef<Corner | null>(null);

  // The corner nearest the camera, and of its two façades the one the camera faces more
  useFrame(({ camera }) => {
    const c = camera.position;
    const x = Math.abs(c.x - box.min.x) < Math.abs(c.x - box.max.x) ? 'min' : 'max';
    const z = Math.abs(c.z - box.min.z) < Math.abs(c.z - box.max.z) ? 'min' : 'max';
    const dx = Math.abs(c.x - box[x].x),
      dz = Math.abs(c.z - box[z].z);
    // Plan y is three's z: north (top) is -z
    const side: Side = dz >= dx ? (z === 'min' ? 'top' : 'bottom') : x === 'min' ? 'left' : 'right';
    const was = now.current;
    if (was && was.x === x && was.z === z && was.side === side) return;
    now.current = { x, z, side };
    setCorner(now.current);
  });

  const key = shown.join();
  const side = corner?.side;
  const dims = useMemo(() => (side ? heightDimensions(project, key.split(','), side) : null), [project, key, side]);
  if (!corner || !dims?.chains.length) return null;

  const size = box.getSize(new THREE.Vector3());
  const step = Math.max(0.7, Math.max(size.x, size.z) * 0.05);
  const tick = step * 0.22;
  const at = new THREE.Vector3(box[corner.x].x, 0, box[corner.z].z);
  // The chains go out beyond the corner, along the façade
  const along =
    corner.side === 'top' || corner.side === 'bottom'
      ? new THREE.Vector3(corner.x === 'min' ? -1 : 1, 0, 0)
      : new THREE.Vector3(0, 0, corner.z === 'min' ? -1 : 1);
  const slash = along
    .clone()
    .add(new THREE.Vector3(0, 1, 0))
    .normalize()
    .multiplyScalar(tick);
  const place = (k: number, mm: number, out = 0) =>
    at
      .clone()
      .addScaledVector(along, step * (k + 0.8) + out)
      .setY(mm * M);
  const outer = dims.chains.length - 1;

  const segments: THREE.Vector3[] = [];
  dims.chains.forEach((chain, k) => {
    segments.push(place(k, chain[0]), place(k, chain[chain.length - 1]));
    for (const mm of chain) {
      const p = place(k, mm);
      // A tick across the line, and a short extension line back towards the house
      segments.push(p.clone().sub(slash), p.clone().add(slash));
      segments.push(p.clone().addScaledVector(along, -tick * 1.6), p.clone().addScaledVector(along, tick * 0.8));
    }
  });

  return (
    <group>
      <Line points={segments} segments color={ink} lineWidth={1} raycast={none} userData={marks} />
      {dims.chains.flatMap((chain, k) =>
        chain.slice(1).map((mm, i) => {
          const len = Math.round(mm - chain[i]);
          if (len < MIN_TEXT) return null;
          return (
            <Html key={`${k}-${i}`} position={place(k, (mm + chain[i]) / 2, step * 0.3)} center zIndexRange={[5, 0]} pointerEvents="none">
              {/* Written along the chain, as drawings write vertical dimensions */}
              <span className="block -rotate-90 font-mono text-[10px] whitespace-nowrap text-foreground select-none" data-height-dim={len}>
                {len}
              </span>
            </Html>
          );
        }),
      )}
      {[...dims.levels.map(l => l.at), dims.grade].map(mm => (
        // The grade's label just below its line, clear of the ground floor's a little above it
        <Html
          key={`e${mm}`}
          position={place(outer, mm, step * 1.1).add(new THREE.Vector3(0, mm === dims.grade ? -step * 0.25 : 0, 0))}
          center
          zIndexRange={[5, 0]}
          pointerEvents="none"
        >
          <span className="font-mono text-[10px] whitespace-nowrap text-foreground select-none" data-elevation={mm} data-side={corner.side}>
            {elevationText(mm)}
          </span>
        </Html>
      ))}
    </group>
  );
}
