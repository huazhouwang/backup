/**
 * The compass over the canvas, top-right under the tools, shared by the plan and the 3D view: its needle points to true north (in
 * 3D it turns with the view; a tap turns the view to look north).
 */
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { m } from '@/lib/i18n';
import { useEditor } from '../store';
import { useHeading } from './heading';

/** The compass's size (px) */
const SIZE = 56;

export function Compass({ className }: { className?: string }) {
  const mode = useEditor(s => s.view.mode);
  const northAngle = useEditor(s => s.project.site.northAngle);
  const faceNorth = useEditor(s => s.faceNorth);
  const heading = useHeading();
  // Where true north points on screen, clockwise from up: the drawing's north in the plan, the view's in 3D
  const north = mode === '3d' ? heading : northAngle;
  const c = SIZE / 2;
  const needle = (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-full" aria-hidden>
      <g transform={`rotate(${north} ${c} ${c})`}>
        <path d={`M${c} 12 L${c + 4.5} ${c} L${c} ${c - 3} L${c - 4.5} ${c} Z`} fill="var(--foreground)" />
        <path d={`M${c} ${SIZE - 12} L${c + 4.5} ${c} L${c} ${c + 3} L${c - 4.5} ${c} Z`} fill="var(--muted-foreground)" />
        <text x={c} y={9.5} textAnchor="middle" fontSize={8} fontWeight={600} fill="var(--foreground)">
          N
        </text>
      </g>
    </svg>
  );
  return (
    <div className={cn('relative', className)} style={{ width: SIZE, height: SIZE }}>
      {mode === '3d' ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="outline" className="size-full rounded-full bg-background/90 p-0 shadow-xs" onClick={faceNorth} aria-label={m.compass_north()} />
            }
          >
            {needle}
          </TooltipTrigger>
          <TooltipContent side="left">{m.compass_north()}</TooltipContent>
        </Tooltip>
      ) : (
        <div role="img" aria-label={m.compass()} className="size-full rounded-full bg-background/90 shadow-xs ring-1 ring-border">
          {needle}
        </div>
      )}
    </div>
  );
}
