import { BoxIcon, CameraIcon, CrosshairIcon, LayersIcon, RulerIcon, ScissorsLineDashedIcon, SquareIcon } from 'lucide-react';
import { useState } from 'react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Toggle } from '@/components/ui/toggle';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { m } from '@/lib/i18n';
import { useEditor } from '../store';
import type { StandardView } from '../store/types';
import { AddMenu } from './AddMenu';

const STANDARD_VIEWS: StandardView[] = ['iso', 'top', 'front', 'back', 'left', 'right'];
const STANDARD_LABEL: Record<StandardView, () => string> = {
  iso: m.camera_iso,
  top: m.camera_top,
  front: m.camera_front,
  back: m.camera_back,
  left: m.camera_left,
  right: m.camera_right,
};

/**
 * View tools, floating over the canvas top-right: in the plan the add palette and the section tool, in 3D the view menu
 * (SketchUp's Camera menu: standard views, perspective or parallel projection, walking; flipping or clearing the section) and the cutaway toggle, the tape measure, fit all, and the view switch (showing the view you are in; pressing it goes to the other one).
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
  const camera3d = useEditor(s => s.camera3d);
  const setCamera3d = useEditor(s => s.setCamera3d);
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
      // Walking and the section plane end with 3D; the projection stays, as in SketchUp
      setCamera3d({ walking: false, section: null });
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
          <DropdownMenuTrigger render={<Button size="sm" variant="outline" className="bg-background" aria-label={m.camera_menu()} />}>
            <CameraIcon />
            {camera3d.walking ? m.camera_walk() : camera3d.projection === 'parallel' ? m.camera_parallel() : m.camera_menu()}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{m.camera_standard()}</DropdownMenuLabel>
              {STANDARD_VIEWS.map(v => (
                <DropdownMenuItem key={v} onClick={() => setCamera3d({ walking: false, standard: { view: v, at: Date.now() } })}>
                  {STANDARD_LABEL[v]()}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup value={camera3d.projection} onValueChange={v => setCamera3d({ projection: v as 'perspective' | 'parallel' })}>
              <DropdownMenuRadioItem value="perspective" closeOnClick>
                {m.camera_perspective()}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="parallel" closeOnClick>
                {m.camera_parallel()}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem checked={camera3d.walking} onCheckedChange={walking => setCamera3d({ walking })} closeOnClick>
              {m.camera_walk()}
            </DropdownMenuCheckboxItem>
            {camera3d.section && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => camera3d.section && setCamera3d({ section: { a: camera3d.section.b, b: camera3d.section.a } })}>
                  {m.view_section_flip()}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCamera3d({ section: null })}>{m.camera_section_clear()}</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {view.mode === '3d' && !camera3d.walking && !camera3d.section && (
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
