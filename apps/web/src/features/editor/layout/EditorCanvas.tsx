import { lazy, Suspense, useEffect } from 'react';
import { CanvasFrame } from '@/canvas/CanvasFrame';
import { Spinner } from '@/components/ui/spinner';
import { HopDriver } from '@/canvas/HopDriver';
import { Plan2D } from '../plan/Plan2D';
import { useEditor } from '../store';
import { CanvasTools } from './CanvasTools';
import { LevelSwitcher } from './LevelSwitcher';

/** 3D (three.js) is most of the plan page script; load it only when switching to 3D */
const loadModel3D = () => import('../model3d/Model3D');
const Model3D = lazy(() => loadModel3D().then(mod => ({ default: mod.Model3D })));

/**
 * The canvas with its floating controls: the plan or the 3D view (the plan stays on screen while 3D gets ready), the level
 * switcher top-left and the view tools top-right.
 */
export function EditorCanvas({ svgRef }: { svgRef?: React.RefObject<SVGSVGElement | null> }) {
  const view = useEditor(s => s.view);
  const planUntil3D = useEditor(s => s.planUntil3D);
  // Fetch the 3D view's code once the canvas is idle, so switching to 3D grows the house without a loading pause first
  useEffect(() => {
    const id = setTimeout(() => void loadModel3D(), 1500);
    return () => clearTimeout(id);
  }, []);
  return (
    <>
      <CanvasFrame className="absolute inset-0 size-full border-0">
        <HopDriver />
        {view.mode === '2d' ? (
          <Plan2D svgRef={svgRef} />
        ) : (
          <Suspense
            fallback={
              <div className="flex size-full items-center justify-center text-muted-foreground">
                <Spinner className="size-6" />
              </div>
            }
          >
            <Model3D />
          </Suspense>
        )}
        {view.mode === '3d' && planUntil3D && (
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <Plan2D />
          </div>
        )}
      </CanvasFrame>
      <div className="absolute top-2 left-2">
        <LevelSwitcher className="bg-background shadow-xs" />
      </div>
      <CanvasTools className="absolute top-2 right-2" />
    </>
  );
}
