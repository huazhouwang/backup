import { BoxIcon, CrosshairIcon, EyeIcon, LayersIcon, RulerIcon, ScissorsLineDashedIcon, SquareIcon } from 'lucide-react';
import { useState } from 'react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Toggle } from '@/components/ui/toggle';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { m } from '@/lib/i18n';
import { useEditor } from '../store';
import { AddMenu } from './AddMenu';

const VIEW_LABEL: Record<string, () => string> = {
  perspective: m.view_perspective,
  north: m.view_north,
  south: m.view_south,
  east: m.view_east,
  west: m.view_west,
  section: m.view_section,
};

/**
 * View tools, floating over the canvas top-right: in the plan the add palette and the section tool, in 3D the view menu
 * (perspective, elevations, the section) and the cutaway toggle, the tape measure, fit all, and the view switch (showing the view you are in; pressing it goes to the other one).
 */
export function CanvasTools({ className }: { className?: string }) {
  const view = useEditor(s => s.view);
  const setView = useEditor(s => s.setView);
  const fitView = useEditor(s => s.fitView);
  const leave3D = useEditor(s => s.leave3D);
  const setPlanUntil3D = useEditor(s => s.setPlanUntil3D);
  const setPlacing = useEditor(s => s.setPlacing);
  const measuring = useEditor(s => s.measuring);
  const setMeasuring = useEditor(s => s.setMeasuring);
  const sectioning = useEditor(s => s.sectioning);
  const setSectioning = useEditor(s => s.setSectioning);
  const view3d = useEditor(s => s.view3d);
  const setView3d = useEditor(s => s.setView3d);
  const viewValue = view3d.kind === 'elevation' ? view3d.side : view3d.kind;
  const canEdit = useEditor(s => s.canEdit());
  const [switching, setSwitching] = useState(false);
  const to = view.mode === '2d' ? '3d' : '2d';
  // Leaving 3D lets the house sink back into the plan first
  const switchView = async () => {
    setSwitching(true);
    setPlacing(null);
    setSectioning(false);
    try {
      if (to === '2d' && leave3D) await leave3D();
      else if (to === '3d') setPlanUntil3D(true);
      // The plan is always left from, and 3D always entered in, the perspective view
      setView3d({ kind: 'perspective' });
      setView({ mode: to });
    } finally {
      setSwitching(false);
    }
  };
  const cutaway = view.layers.cutaway;
  return (
    <div className={cn('flex gap-1', className)}>
      {view.mode === '2d' && canEdit && <AddMenu />}
      {view.mode === '2d' && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Toggle
                size="sm"
                variant="outline"
                className="bg-background aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                pressed={sectioning}
                onPressedChange={setSectioning}
                aria-label={m.section_tool()}
              />
            }
          >
            <ScissorsLineDashedIcon />
          </TooltipTrigger>
          <TooltipContent>{m.section_tool()}</TooltipContent>
        </Tooltip>
      )}
      {view.mode === '3d' && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="sm" variant="outline" className="bg-background" aria-label={m.view_menu()} />}>
            <EyeIcon />
            {VIEW_LABEL[viewValue]()}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup
              value={viewValue}
              onValueChange={v =>
                setView3d(
                  v === 'perspective'
                    ? { kind: 'perspective' }
                    : v === 'section'
                      ? view3d
                      : { kind: 'elevation', side: v as 'north' | 'south' | 'east' | 'west' },
                )
              }
            >
              {(['perspective', 'north', 'south', 'east', 'west'] as const).map(k => (
                <DropdownMenuRadioItem key={k} value={k} closeOnClick>
                  {VIEW_LABEL[k]()}
                </DropdownMenuRadioItem>
              ))}
              {view3d.kind === 'section' && (
                <DropdownMenuRadioItem value="section" closeOnClick>
                  {VIEW_LABEL.section()}
                </DropdownMenuRadioItem>
              )}
            </DropdownMenuRadioGroup>
            {view3d.kind === 'section' && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setView3d({ kind: 'section', a: view3d.b, b: view3d.a })}>{m.view_section_flip()}</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {view.mode === '3d' && view3d.kind === 'perspective' && (
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
        <TooltipTrigger
          render={
            <Toggle
              size="sm"
              variant="outline"
              className="bg-background aria-pressed:bg-primary aria-pressed:text-primary-foreground"
              pressed={measuring}
              onPressedChange={setMeasuring}
              aria-label={m.measure_tool()}
            />
          }
        >
          <RulerIcon />
        </TooltipTrigger>
        <TooltipContent>{m.measure_tool()}</TooltipContent>
      </Tooltip>
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
