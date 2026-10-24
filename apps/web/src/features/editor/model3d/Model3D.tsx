/**
 * 3D massing model, drawn as a white model: walls as solids from the segments cut by the core package, spaces as slabs,
 * furniture, doors, windows and railings by their looks, each floor carrying its plan linework. Light and soft shadows give the
 * form, no outlines. Shows the whole house, or with the cutaway layer the current floor and below; picking is synced with the
 * plan. The parts are in meshes.tsx over the shared scene layer (./scene); the camera, picking and screenshots in their own
 * modules. Units: data in millimetres, scene in metres.
 */
import { OrbitControls, PerformanceMonitor } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import {
  findObject,
  furnitureTarget,
  getBuild,
  lookRecipe,
  openingFrames,
  openingTarget,
  projectBoxes,
  projectElements,
  roofs,
  type Solid,
  type Wall,
} from '@plinth/core';
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useCanvasDocument } from '@/canvas/CanvasFrame';
import { useBuildsVersion } from '@/lib/builds';
import { m } from '@/lib/i18n';
import { materialStyle } from '@/lib/materials';
import { useThemeColors } from '@/lib/theme';
import { modelStyle } from '@/graphics/model-style';
import { planFrame } from '@/graphics/plan/plan-geometry';
import { useEditor } from '../store';
import { CameraRig } from './CameraRig';
import { Capture, Wake } from './Capture';
import { TintColors } from './feedback';
import { FloorDrawing, GroundDimensions, PlanSheet } from './FloorDrawing';
import { FOV } from '@/graphics/three/framing';
import { HouseStage } from './HouseStage';
import { Picker, SafariPinch } from './interaction';
import { ElementExtras, Furniture, OpeningLook, RailingLook, RoofMesh, Slab, SolidMesh, WallMesh } from './meshes';
import { detectQuality, isTouchDevice, Renderer, type Quality } from './Renderer';
import { Reveal } from './Reveal';
import {
  elementLook,
  hasExtras,
  hasSlab,
  houseBox,
  M,
  siteBounds,
  backdrop,
  slabLevel,
  solidFallbackColor,
  solidMaterial,
  wallFinish,
} from '@/graphics/three/scene';

/** The 3D view's own colors (light, backdrop, selection) come from the theme; materials come from libraries */
const useColors = () =>
  useThemeColors(
    {
      backdrop: '--canvas-backdrop',
      sun: '--canvas-sun',
      skylight: '--canvas-skylight',
      wall: '--card',
      furn: '--muted',
      grate: '--muted-foreground',
      page: '--canvas-backdrop',
      sky: '--canvas-sky',
      ground: '--canvas-ground',
      edge: '--foreground',
      shadow: '--canvas-shadow',
      sel: '--chart-2',
      changed: '--chart-1',
    },
    useCanvasDocument(),
  );

export function Model3D() {
  const project = useEditor(s => s.project);
  const view = useEditor(s => s.view);
  const projectId = useEditor(s => s.projectId);
  const c = useColors();
  const style = modelStyle();
  const doc = useCanvasDocument();
  // Decided once the WebGL context exists (the GPU model is part of it); a touch device that can't keep up drops to 'low'
  const [quality, setQuality] = useState<Quality | null>(null);
  const touch = useMemo(() => isTouchDevice(doc.defaultView!), [doc]);
  const q: Quality = quality ?? 'high';
  const draw = useRef<(() => void) | null>(null);

  // Redraw element materials and extras when their builds finish
  useBuildsVersion();
  const current = project.levels.find(l => l.id === view.level);
  // The whole house by default; the cutaway shows the current level and below, to look into it
  const shown = project.levels.filter(l => !view.layers.cutaway || !current || l.elevation <= current.elevation);
  const elev = new Map(project.levels.map(l => [l.id, l.elevation]));
  const boxes = useMemo(() => projectBoxes(project), [project]);
  const solids = useMemo(() => projectElements(project).flatMap(g => g.solids), [project]);
  const openings = useMemo(() => openingFrames(project), [project]);
  const roofed = useMemo(() => roofs(project), [project]);
  const elementBuilt = (e: (typeof project.elements)[number]) => {
    const look = elementLook(project, e);
    return look.recipe ? getBuild(look.recipe, look.size, look.params) : undefined;
  };
  // An element's own geometry in the materials its look gives each kind of solid
  const fallback = { '--muted': c.furn, '--muted-foreground': c.grate, '--card': c.wall };
  const solidColor = (s: Solid) => {
    const e = project.elements.find(x => x.id === s.id);
    return (e && solidMaterial(project, elementBuilt(e), s, e)?.color) ?? fallback[solidFallbackColor(s)];
  };
  // A wall's faces in its finish (plain white with a style that draws white walls)
  const finish = (w: Wall) => (style.walls === 'finish' ? wallFinish(project, w) : { ...materialStyle(undefined), color: c.wall, roughness: 0.9 });
  const ownerOf = (id: string) => findObject(project, id, 'opening')?.wall?.id;
  // A door or window is part of its wall in 3D, so selecting it marks the wall
  const sel = new Set(view.selection.map(id => ownerOf(id) ?? id));
  const tints = useMemo(() => ({ sel: new THREE.Color(c.sel), changed: new THREE.Color(c.changed) }), [c.sel, c.changed]);

  const [x0, y0, x1, y1] = useMemo(() => siteBounds(project), [project.site.boundary]);
  const cx = ((x0 + x1) / 2) * M,
    cz = ((y0 + y1) / 2) * M,
    span = Math.max(x1 - x0, y1 - y0) * M;

  // The shown floors' extent, for framing the camera
  const shownIds = shown.map(l => l.id).join();
  const box = useMemo(() => houseBox(project, boxes, new Set(shownIds.split(','))), [boxes, project.spaces, shownIds, x0, y0, x1, y1]);
  const radius = Math.max(2, box.getSize(new THREE.Vector3()).length() / 2);
  const center = box.getCenter(new THREE.Vector3());
  const levels = [...shown].sort((a, b) => a.elevation - b.elevation);
  const growing = useRef(new Map<string, THREE.Group>());
  const drawings = useRef(new Map<string, THREE.Group>());
  // How far the house has grown out of the plan (0 flat, 1 built); the plan's paper fades with it
  const growth = useRef({ g: 1 });
  const sheet = useMemo(() => {
    // The margin around the drawing is even, so the centre is the same with or without dimensions
    const { x, y, w, h } = planFrame(project, current?.id ?? levels[0]?.id ?? '');
    return { center: [(x + w / 2) * M, (y + h / 2) * M] as [number, number] };
  }, [project, current?.id]);

  return (
    <div className="relative size-full">
      <TintColors.Provider value={tints}>
        <Canvas
          shadows="percentage"
          frameloop="demand"
          // Full resolution for crisp edges; low-end phones a little less
          dpr={q === 'high' ? [1, 2] : [1, 1.5]}
          // No tone mapping: white surfaces stay white instead of the filmic gray
          flat
          gl={{ preserveDrawingBuffer: true, antialias: true }}
          camera={{ position: [cx + span * 0.9, span * 0.8, cz + span * 1.1], fov: FOV, near: 0.1, far: 2000 }}
          // White like the plan's page until the first frame: switching from the plan shows no gray flash
          style={{ background: c.page }}
          // react-three-fiber sizes the canvas with CSS only when it is an HTMLCanvasElement of the parent window, which a
          // canvas in our iframe is not. Without it the canvas shows at its drawing-buffer size, twice too large on 2x screens,
          // so the model sits off-center and clicks miss. Fill the wrapper instead.
          onCreated={({ gl, scene }) => {
            Object.assign(gl.domElement.style, { width: '100%', height: '100%' });
            scene.background = backdrop(style, { backdrop: c.backdrop, sky: c.sky, horizon: c.backdrop, ground: c.ground });
            setQuality(detectQuality(doc.defaultView!, gl.getContext()));
          }}
        >
          <HouseStage project={project} center={center} radius={radius} span={span} quality={q} colors={c} />

          {/* The plan's page around the drawing at the current floor, while the house lies flat */}
          <group position={[0, (current?.elevation ?? 0) * M, 0]}>
            <PlanSheet center={sheet.center} size={Math.max(span, radius) * 40} color={c.page} growth={growth} />
          </group>
          {/* The current floor's dimensions, on the ground */}
          {view.layers.dimensions && current && <GroundDimensions project={project} level={current.id} quality={q} growth={growth} />}
          <group>
            {levels.map(l => {
              const base = elev.get(l.id) ?? 0;
              return (
                // Each floor grows from its own base when entering 3D (see CameraRig)
                <group key={l.id} position={[0, l.elevation * M, 0]}>
                  <group ref={g => void (g ? growing.current.set(l.id, g) : growing.current.delete(l.id))}>
                    <group position={[0, -l.elevation * M, 0]}>
                      {project.spaces
                        .filter(s => s.level === l.id && hasSlab(s))
                        .map(s => (
                          <Slab
                            key={s.id}
                            s={s}
                            {...slabLevel(s, l.elevation, project.site.groundLevel)}
                            color={c.wall}
                            materials={project.library.materials}
                            sel={sel.has(s.id) ? c.sel : undefined}
                          />
                        ))}
                      {/* Roofs over rooms with nothing above; the cutaway lifts the current floor's off, as it does the floors above */}
                      {roofed
                        .filter(r => r.level === l.id && !(view.layers.cutaway && l.id === current?.id))
                        .map(r => (
                          <RoofMesh key={`roof-${r.space}`} r={r} base={base} color={c.wall} sel={sel.has(r.space) ? c.sel : undefined} />
                        ))}
                      {project.walls
                        .filter(w => w.level === l.id)
                        .map(w =>
                          w.kind === 'railing' ? (
                            <RailingLook key={w.id} w={w} project={project} base={base} sel={sel.has(w.id) ? c.sel : undefined} />
                          ) : (
                            <WallMesh key={w.id} w={w} project={project} base={base} sel={sel.has(w.id) ? c.sel : undefined} finish={finish(w)} />
                          ),
                        )}
                      {openings
                        .filter(fr => fr.level === l.id)
                        .map(fr => (
                          <OpeningLook
                            key={fr.id}
                            fr={fr}
                            recipe={lookRecipe(project, openingTarget(fr.opening), fr.opening.look)}
                            params={fr.opening.lookParams}
                            base={base}
                            sel={sel.has(fr.wall) ? c.sel : undefined}
                          />
                        ))}
                      {solids
                        .filter(s => s.level === l.id)
                        .map((s, i) => (
                          <SolidMesh key={`${s.id}-${i}`} s={s} base={base} sel={sel.has(s.id) ? c.sel : undefined} color={solidColor(s)} />
                        ))}
                      {project.elements
                        .filter(e => e.level === l.id)
                        .map(e => {
                          const recipe = elementLook(project, e).recipe,
                            own = solids.filter(s => s.id === e.id);
                          return recipe && own.length && hasExtras(elementBuilt(e)) ? (
                            <ElementExtras key={e.id} e={e} solids={own} recipe={recipe} base={base} sel={sel.has(e.id) ? c.sel : undefined} />
                          ) : null;
                        })}
                      {view.layers.furniture &&
                        project.furniture
                          .filter(f => f.level === l.id)
                          .map(f => (
                            <Furniture
                              key={f.id}
                              f={f}
                              recipe={lookRecipe(project, furnitureTarget(f), f.look)}
                              base={base}
                              color={c.furn}
                              sel={sel.has(f.id) ? c.sel : undefined}
                            />
                          ))}
                    </group>
                  </group>
                  {/* Outside the growing group, so the drawing stays just above the floor while the floor is flat; shown with its floor */}
                  <group ref={g => void (g ? drawings.current.set(l.id, g) : drawings.current.delete(l.id))}>
                    <FloorDrawing
                      project={project}
                      level={l.id}
                      current={l.id === current?.id}
                      furniture={view.layers.furniture}
                      labels={view.layers.labels}
                      dimensions={view.layers.dimensions}
                      quality={q}
                      growth={growth}
                    />
                  </group>
                </group>
              );
            })}
          </group>
          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.09}
            maxPolarAngle={Math.PI / 2 - 0.05}
            minDistance={Math.max(1.5, radius * 0.15)}
            maxDistance={radius * 6}
          />
          <CameraRig box={box} levels={levels} current={current?.id ?? ''} growing={growing} drawings={drawings} growth={growth} projectId={projectId} />
          <SafariPinch />
          <Picker />
          <Reveal ownerOf={ownerOf} />
          <Renderer draw={draw} edges={style.edges} edgeColor={c.edge} growth={growth} />
          {/* A phone that wasn't recognized as low-end but can't keep up drops to the light setup, for good */}
          {touch && q === 'high' && <PerformanceMonitor bounds={() => [25, 50]} onDecline={() => setQuality('low')} />}
          <Wake on={[view.selection, view.highlight]} />
          <Capture draw={draw} />
        </Canvas>
      </TintColors.Provider>
      <p className="pointer-events-none absolute bottom-2 left-3 text-xs text-muted-foreground max-md:hidden">{m.model3d_hint()}</p>
    </div>
  );
}
