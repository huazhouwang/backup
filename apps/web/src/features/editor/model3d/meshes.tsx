/**
 * The parts of a house in the 3D view, as react-three-fiber components over the shared scene layer (./scene): walls, floor slabs,
 * doors and windows, railings, elements and furniture. Each answers selection with a tint and an outline (see feedback.ts) and
 * records its id in userData for picking.
 */
import { Edges } from '@react-three/drei';
import type { Element, OpeningFrame, Project, Recipe, RecipeMaterial, Solid, Space, Wall } from '@plinth/core';
import { footing, lookRecipe, materialOf, wallTarget, type Material } from '@plinth/core';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useCanvasDocument } from '@/canvas/CanvasFrame';
import { materialStyle, type MaterialStyle } from '@/lib/materials';
import { modelStyle } from '@/graphics/model-style';
import { useEditor } from '../store';
import { useFeedback } from './feedback';
import { useFloorTexture } from '@/graphics/three/floor-textures';
import { lookMaterial, partsGeometry, useBuild } from '@/graphics/three/looks';
import { castsShadow, elementExtent, M, railingPieces, slabGeometry, solidGeometry, standardMaterialProps, wallGeometry } from '@/graphics/three/scene';

const unitBox = new THREE.BoxGeometry(1, 1, 1);

/** No outlines on the model, except the selected object's edges in the selection color */
export type Outline = { sel?: string };

/** Dispose of a geometry when it is replaced or the component goes */
function useDisposed(geo: THREE.BufferGeometry) {
  useEffect(() => () => geo.dispose(), [geo]);
  return geo;
}

/** A wall as one solid in its finish (see wallGeometry), down to the ground on the ground floor; glass is drawn by the openings' looks */
export function WallMesh({ w, project, base, finish, ...o }: Outline & { w: Wall; project: Project; base: number; finish: MaterialStyle }) {
  const ref = useFeedback<THREE.Mesh>(w.id, finish.color, !!o.sel);
  const below = footing(base, project.site.groundLevel);
  const geo = useDisposed(useMemo(() => wallGeometry(project, w, below), [w, project, below]));
  const y = base * M;
  return (
    <mesh ref={ref} geometry={geo} position={[w.start[0] * M, y, w.start[1] * M]} castShadow receiveShadow userData={{ id: w.id, restY: y }}>
      <meshStandardMaterial color={finish.color} roughness={finish.roughness} metalness={finish.metalness} />
      {o.sel && <Edges threshold={20} color={o.sel} lineWidth={2} />}
    </mesh>
  );
}

/** A space's floor slab with its top at `y` (millimetres) */
export function Slab({
  s,
  y,
  thickness,
  color,
  materials,
  ...o
}: Outline & { s: Space; y: number; thickness: number; color: string; materials: Record<string, Material> }) {
  // The floor's material, as on the plan: its pattern, else its colour (white with a style that draws plain floors)
  const floor = modelStyle().floors === 'material' ? materialOf(s.floor, null, materials) : undefined;
  const map = useFloorTexture(useCanvasDocument(), s.floor, floor);
  if (floor && !map) color = materialStyle(floor).color;
  const ref = useFeedback<THREE.Mesh>(s.id, color, !!o.sel);
  const geo = useDisposed(useMemo(() => slabGeometry(s.shape, thickness), [s.shape, thickness]));
  // Two millimetres up: the walls of the floor below end exactly at this floor's level, and their tops would flicker through it
  const bottom = (y + 2 - thickness) * M;
  return (
    <mesh ref={ref} geometry={geo} position={[0, bottom, 0]} receiveShadow userData={{ id: s.id, restY: bottom }}>
      {/* Remounted when the texture arrives: a material compiles once for having a map or not */}
      <meshStandardMaterial key={map ? 'map' : 'plain'} color={color} map={map} roughness={1} />
      {o.sel && <Edges threshold={20} color={o.sel} lineWidth={2} />}
    </mesh>
  );
}

/**
 * A door or window drawn by its look (see packages/core/src/looks): by default a window or sliding door is a clear pane in a
 * thin dark frame and a glass-block infill is frosted white; doors stay open. Glass casts no shadow, so sunlight falls through
 * the opening. Part of its wall: picking it picks the wall.
 */
export function OpeningLook({
  fr,
  recipe,
  params,
  base,
  ...o
}: Outline & { fr: OpeningFrame; recipe: Recipe | null; params?: Record<string, unknown>; base: number }) {
  const y = (base + fr.z) * M;
  const ref = useFeedback<THREE.Group>(fr.wall, null, !!o.sel);
  const parts = useLookGeometry(recipe, fr.width, fr.thickness, fr.height, params);
  if (!parts.length) return null;
  return (
    <group ref={ref} position={[fr.center[0] * M, y, fr.center[1] * M]} rotation={[0, -fr.angle, 0]} userData={{ restY: y }}>
      <LookMeshes parts={parts} id={fr.wall} recipe={recipe} />
    </group>
  );
}

/** A piece of an element (a stair step, a pond's rim or water): its plan outline extruded */
export function SolidMesh({ s, base, color, ...o }: Outline & { s: Solid; base: number; color: string }) {
  const y = (base + s.z) * M;
  const ref = useFeedback<THREE.Mesh>(s.id, color, !!o.sel);
  const geo = useDisposed(useMemo(() => solidGeometry(s), [s.outline, s.height]));
  return (
    <mesh ref={ref} geometry={geo} position={[0, y, 0]} castShadow={s.kind === 'structure'} receiveShadow userData={{ id: s.id, restY: y }}>
      <meshStandardMaterial color={color} roughness={0.9} />
      {o.sel && <Edges threshold={20} color={o.sel} lineWidth={2} />}
    </mesh>
  );
}

/** A piece of furniture: drawn by its look, or a box of its size when it has none */
export function Furniture({ f, recipe, base, color, ...o }: Outline & { f: Project['furniture'][number]; recipe: Recipe | null; base: number; color: string }) {
  return recipe ? <FurnitureModel f={f} recipe={recipe} base={base} {...o} /> : <FurnitureBox f={f} base={base} color={color} {...o} />;
}

/** Furniture without a look: a box of its size */
function FurnitureBox({ f, base, color, ...o }: Outline & { f: Project['furniture'][number]; base: number; color: string }) {
  const y = (base + (f.elevation ?? 0) + f.size.h / 2) * M;
  const ref = useFeedback<THREE.Mesh>(f.id, color, !!o.sel);
  return (
    <mesh
      ref={ref}
      geometry={unitBox}
      castShadow
      userData={{ id: f.id, restY: y }}
      position={[f.position[0] * M, y, f.position[1] * M]}
      rotation={[0, (-f.rotation * Math.PI) / 180, 0]}
      scale={[f.size.w * M, f.size.h * M, f.size.d * M]}
    >
      <meshStandardMaterial color={color} roughness={0.95} />
      {o.sel && <Edges threshold={20} color={o.sel} lineWidth={2} />}
    </mesh>
  );
}

/** A piece of furniture drawn by its look (see packages/core/src/looks); selected, it is outlined by its bounding box */
function FurnitureModel({ f, recipe, base, ...o }: Outline & { f: Project['furniture'][number]; recipe: Recipe; base: number }) {
  const y = (base + (f.elevation ?? 0)) * M;
  const ref = useFeedback<THREE.Group>(f.id, null, !!o.sel);
  const { w, d, h } = f.size;
  const parts = useLookGeometry(recipe, w, d, h, f.lookParams);
  return (
    <group ref={ref} position={[f.position[0] * M, y, f.position[1] * M]} rotation={[0, (-f.rotation * Math.PI) / 180, 0]} userData={{ restY: y }}>
      <LookMeshes parts={parts} id={f.id} recipe={recipe} />
      {o.sel && (
        <mesh geometry={unitBox} position={[0, (h / 2) * M, 0]} scale={[w * M, h * M, d * M]} raycast={() => null} userData={{ noEdges: true }}>
          <meshBasicMaterial visible={false} />
          <Edges color={o.sel} lineWidth={2} />
        </mesh>
      )}
    </group>
  );
}

/**
 * A railing drawn by its look (the railing look of the default library, the design's or its own), built for each piece of the
 * railing between openings: as long as the piece, as thick and as high as the railing
 */
export function RailingLook({ w, project, base, ...o }: Outline & { w: Wall; project: Project; base: number }) {
  const recipe = lookRecipe(project, wallTarget(w), w.look);
  const ref = useFeedback<THREE.Group>(w.id, null, !!o.sel);
  const pieces = useMemo(() => railingPieces(project, w), [w, project]);
  return (
    <group ref={ref} position={[0, base * M, 0]} userData={{ restY: base * M }}>
      {pieces.map((b, i) => (
        <RailingPiece key={i} b={b} w={w} recipe={recipe} />
      ))}
    </group>
  );
}

function RailingPiece({ b, w, recipe }: { b: ReturnType<typeof railingPieces>[number]; w: Wall; recipe: Recipe | null }) {
  const parts = useLookGeometry(recipe, b.length, b.thickness, b.height, w.lookParams);
  return (
    <group position={[b.center[0] * M, b.z * M, b.center[1] * M]} rotation={[0, -b.angle, 0]}>
      <LookMeshes parts={parts} id={w.id} recipe={recipe} />
    </group>
  );
}

/** An element's look beyond its own geometry (`base`): extra parts, built at its plan extent from the centre of that extent */
export function ElementExtras({ e, solids, recipe, base, ...o }: Outline & { e: Element; solids: Solid[]; recipe: Recipe; base: number }) {
  const ext = elementExtent(solids);
  const ref = useFeedback<THREE.Group>(e.id, null, !!o.sel);
  const parts = useLookGeometry(recipe, ext.w, ext.d, ext.h, e.lookParams);
  if (!parts.length) return null;
  return (
    <group ref={ref} position={[ext.center[0] * M, base * M, ext.center[1] * M]} userData={{ restY: base * M }}>
      <LookMeshes parts={parts} id={e.id} recipe={recipe} />
    </group>
  );
}

/** A recipe's geometry at a size (one per material), disposed when it changes */
function useLookGeometry(recipe: Recipe | null, w: number, d: number, h: number, params?: Record<string, unknown>) {
  const built = useBuild(recipe, { w, d, h }, params);
  const parts = useMemo(() => (built ? partsGeometry(built.parts) : []), [built]);
  useEffect(() => () => parts.forEach(([, g]) => g.dispose()), [parts]);
  return parts;
}

/** A look's meshes, one per material in its library's finish; glass lets light through: see-through, no shadow */
function LookMeshes({ parts, id, recipe }: { parts: [RecipeMaterial, THREE.BufferGeometry][]; id: string; recipe: Recipe | null }) {
  const design = useEditor(s => s.project.library.materials);
  return parts.map(([mat, g]) => {
    const style = lookMaterial(mat, recipe, design);
    return (
      <mesh
        key={mat}
        geometry={g}
        castShadow={castsShadow(style)}
        receiveShadow
        userData={{ id, baseColor: new THREE.Color(style.color), noEdges: !castsShadow(style) }}
      >
        <meshStandardMaterial {...standardMaterialProps(style)} />
      </mesh>
    );
  });
}
