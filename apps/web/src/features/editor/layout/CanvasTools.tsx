import { BoxIcon, CrosshairIcon, LayersIcon, SquareIcon } from 'lucide-react';
import { useState } from 'react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { m } from '@/lib/i18n';
import { useEditor } from '../store';

/**
 * View tools, floating over the canvas top-right: fit all, the view switch (showing the view you are in; pressing it goes to
 * the other one), and in 3D the cutaway toggle.
 */
export function CanvasTools({ className }: { className?: string }) {
  const view = useEditor(s => s.view);
  const setView = useEditor(s => s.setView);
  const fitView = useEditor(s => s.fitView);
  const leave3D = useEditor(s => s.leave3D);
  const setPlanUntil3D = useEditor(s => s.setPlanUntil3D);
  const [switching, setSwitching] = useState(false);
  const to = view.mode === '2d' ? '3d' : '2d';
  // Leaving 3D lets the house sink back into the plan first
  const switchView = async () => {
    setSwitching(true);
    try {
      if (to === '2d' && leave3D) await leave3D();
      else if (to === '3d') setPlanUntil3D(true);
      setView({ mode: to });
    } finally {
      setSwitching(false);
    }
  };
  const cutaway = view.layers.cutaway;
  return (
    <div className={cn('flex gap-1', className)}>
      {view.mode === '3d' && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Toggle
                size="sm"
                variant="outline"
                className="bg-background aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                pressed={cutaway}
                onPressedChange={p => setView({ layers: { ...view.layers, cutaway: p } })}
                aria-label={m.model3d_cutaway()}
              />
            }
          >
            <LayersIcon />
          </TooltipTrigger>
          <TooltipContent>{cutaway ? m.model3d_whole() : m.model3d_cutaway()}</TooltipContent>
        </Tooltip>
      )}
      <Tooltip>
        <TooltipTrigger render={<Button size="icon-sm" variant="outline" className="bg-background" onClick={fitView} aria-label={m.canvas_fit()} />}>
          <CrosshairIcon />
        </TooltipTrigger>
        <TooltipContent>{m.canvas_fit()}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="sm"
              variant="outline"
              className="bg-background"
              onClick={switchView}
              disabled={switching}
              aria-label={to === '3d' ? m.editor_switch_to_3d() : m.editor_switch_to_2d()}
            />
          }
        >
          {view.mode === '3d' ? <BoxIcon /> : <SquareIcon />}
          {view.mode === '3d' ? m.editor_view_3d() : m.editor_view_2d()}
        </TooltipTrigger>
        <TooltipContent>{to === '3d' ? m.editor_switch_to_3d() : m.editor_switch_to_2d()}</TooltipContent>
      </Tooltip>
    </div>
  );
}
