/**
 * A look you can turn around: the same stage as its stills (editor/model3d/look-stage.ts), starting from the same view, with
 * drag to orbit, pinch or scroll to zoom, a button back to the starting view, and one that fills the window with it (an overlay:
 * phones' browsers don't put a page element in full screen; Esc or the button again brings it back). It redraws as its
 * parameters and size change. Drawn in the canvas's light theme whatever the website's theme, like the stills.
 */
import type { Recipe } from '@plinth/core';
import { OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { Maximize2Icon, Minimize2Icon, RotateCcwIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { lightDocument } from '@/canvas/CanvasFrame';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cameraPosition, fitDistance, FOV, lookBounds, stageGround, stageSun } from '@/graphics/three/look-stage';
import { lookMaterial, partsGeometry, useBuild } from '@/graphics/three/looks';
import { castsShadow, standardMaterialProps } from '@/graphics/three/scene';
import { m } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useThemeColors } from '@/lib/theme';

type Size = { w: number; d: number; h: number };

export function LookViewer({ recipe, size, params, alt }: { recipe: Recipe; size: Size; params?: Record<string, unknown>; alt: string }) {
  const [doc, setDoc] = useState<Document | null>(null);
  useEffect(() => void lightDocument().then(setDoc), []);
  const built = useBuild(recipe, size, params);
  // A new starting view whenever the look's extent changes; the button goes back to it
  const [view, setView] = useState(0);
  const [max, setMax] = useState(false);
  // While it fills the window: Esc brings it back, and the page behind doesn't scroll
  useEffect(() => {
    if (!max) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMax(false);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [max]);
  if (!doc || !built) return <Skeleton className="aspect-[4/3] w-full" />;
  return (
    <div className="relative aspect-[4/3] w-full">
      {/* Turning it is a drag: no text selection or long-press menu, here or (while dragging) on the rest of the page */}
      <div
        className={cn('touch-none overflow-hidden select-none [-webkit-touch-callout:none]', max ? 'fixed inset-0 z-50' : 'absolute inset-0 rounded-md border')}
        role="img"
        aria-label={alt}
        onPointerDown={noSelectWhileDragging}
        onContextMenu={e => e.preventDefault()}
      >
        <Canvas
          shadows="soft"
          frameloop="demand"
          dpr={[1, 2]}
          gl={{ antialias: true, toneMapping: THREE.NoToneMapping }}
          camera={{ fov: FOV, near: 0.01, far: 200 }}
        >
          <Stage doc={doc} recipe={recipe} parts={built.parts} size={size} view={view} />
        </Canvas>
        <div className={cn('absolute right-2 flex gap-2', max ? 'bottom-[max(0.5rem,env(safe-area-inset-bottom))]' : 'bottom-2')}>
          <Button size="icon-sm" variant="outline" className="bg-background" aria-label={m.look_viewer_reset()} onClick={() => setView(v => v + 1)}>
            <RotateCcwIcon />
          </Button>
          <Button
            size="icon-sm"
            variant="outline"
            className="bg-background"
            aria-label={max ? m.look_viewer_restore() : m.look_viewer_maximize()}
            aria-pressed={max}
            onClick={() => setMax(v => !v)}
          >
            {max ? <Minimize2Icon /> : <Maximize2Icon />}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Keep the page from selecting text while a drag that started on the viewer goes on, wherever the pointer moves */
function noSelectWhileDragging() {
  const style = document.documentElement.style,
    before = style.userSelect;
  style.userSelect = style.webkitUserSelect = 'none';
  const end = () => {
    style.userSelect = style.webkitUserSelect = before;
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
  };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
}

function Stage({ doc, recipe, parts, size, view }: { doc: Document; recipe: Recipe; parts: Parameters<typeof partsGeometry>[0]; size: Size; view: number }) {
  const c = useThemeColors({ backdrop: '--canvas-backdrop', sky: '--canvas-skylight', ground: '--card', sun: '--canvas-sun' }, doc);
  const camera = useThree(s => s.camera);
  const invalidate = useThree(s => s.invalidate);
  const aspect = useThree(s => s.size.width / Math.max(1, s.size.height));
  const geometry = useMemo(() => partsGeometry(parts), [parts]);
  useEffect(() => () => geometry.forEach(([, g]) => g.dispose()), [geometry]);
  const { center, radius } = useMemo(
    () =>
      lookBounds(
        geometry.map(([, g]) => g),
        size,
      ),
    [geometry, size],
  );
  const sun = useMemo(() => stageSun(c.sun, center, radius), [c.sun, center, radius]);
  const ground = useMemo(() => stageGround(radius), [radius]);
  useEffect(
    () => () => {
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      sun.shadow.map?.dispose();
    },
    [ground, sun],
  );
  // The starting view: when the look's extent changes, or on reset
  const key = `${radius.toFixed(3)}:${view}`;
  useEffect(() => {
    camera.position.copy(cameraPosition(center, radius, aspect));
    camera.lookAt(center);
    invalidate();
  }, [key]);
  // When the view changes shape (filling the window and back), keep the angle and refit the distance
  useEffect(() => {
    const dir = camera.position.clone().sub(center).normalize();
    camera.position.copy(center).addScaledVector(dir, fitDistance(radius, aspect));
    invalidate();
  }, [aspect.toFixed(2)]);
  return (
    <>
      <color attach="background" args={[c.backdrop]} />
      <hemisphereLight args={[c.sky, c.ground, 2.4]} />
      <primitive object={sun} />
      <primitive object={sun.target} />
      <primitive object={ground} />
      {geometry.map(([mat, g]) => {
        const style = lookMaterial(mat, recipe);
        return (
          <mesh key={mat} geometry={g} castShadow={castsShadow(style)}>
            <meshStandardMaterial {...standardMaterialProps(style)} />
          </mesh>
        );
      })}
      <OrbitControls
        key={key}
        makeDefault
        target={center}
        enableDamping
        dampingFactor={0.1}
        minDistance={radius * 0.6}
        maxDistance={radius * 12}
        maxPolarAngle={Math.PI / 2 - 0.02}
      />
    </>
  );
}
