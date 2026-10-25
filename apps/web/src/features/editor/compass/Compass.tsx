/**
 * The compass over the canvas, top-right under the tools, shared by the plan and the 3D view: its needle points to true north (in
 * 3D it turns with the view; a tap turns the view to look north) and a sun on its rim shows where the sun stands at the chosen
 * day and time. A tap on the sun opens the date and time, as SketchUp's shadow settings; the 3D sunlight follows.
 */
import { MoonIcon, SunIcon } from 'lucide-react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getLocale, htmlLang, m } from '@/lib/i18n';
import { dateOfDay, dayOfYear, sunPosition } from '@/lib/solar';
import { useEditor } from '../store';
import { useHeading } from './heading';

/** The compass's size and the radius the sun runs on (px) */
const SIZE = 56;
const RIM = 21;

export function Compass({ className }: { className?: string }) {
  const mode = useEditor(s => s.view.mode);
  const site = useEditor(s => s.project.site);
  const sun = useEditor(s => s.sun);
  const setSun = useEditor(s => s.setSun);
  const faceNorth = useEditor(s => s.faceNorth);
  const heading = useHeading();
  // Where true north points on screen, clockwise from up: the drawing's north in the plan, the view's in 3D
  const north = mode === '3d' ? heading : site.northAngle;
  const at = sunPosition(site.location, sun.day, sun.minutes);
  const up = at.elevation > 0;
  const a = ((north + at.azimuth) * Math.PI) / 180;
  const c = SIZE / 2;
  const sx = c + RIM * Math.sin(a),
    sy = c - RIM * Math.cos(a);
  const needle = (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-full" aria-hidden>
      {up && <line x1={c} y1={c} x2={sx} y2={sy} stroke="var(--chart-1)" strokeWidth={2} strokeLinecap="round" />}
      <g transform={`rotate(${north} ${c} ${c})`}>
        <path d={`M${c} 12 L${c + 4.5} ${c} L${c} ${c - 3} L${c - 4.5} ${c} Z`} fill="var(--foreground)" />
        <path d={`M${c} ${SIZE - 12} L${c + 4.5} ${c} L${c} ${c + 3} L${c - 4.5} ${c} Z`} fill="var(--muted-foreground)" />
        <text x={c} y={9.5} textAnchor="middle" fontSize={8} fontWeight={600} fill="var(--foreground)">
          N
        </text>
      </g>
    </svg>
  );
  const time = `${String(Math.floor(sun.minutes / 60)).padStart(2, '0')}:${String(sun.minutes % 60).padStart(2, '0')}`;
  const date = dateOfDay(sun.day).toLocaleDateString(htmlLang(getLocale()), { month: 'long', day: 'numeric' });
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
      <Popover>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size="icon-xs"
              className="absolute -translate-1/2 rounded-full bg-background text-(--chart-1)"
              style={{ left: sx, top: sy }}
              aria-label={m.sun_open()}
            />
          }
        >
          {up ? <SunIcon /> : <MoonIcon className="text-muted-foreground" />}
        </PopoverTrigger>
        <PopoverContent side="left" align="start" className="w-64">
          <PopoverHeader>
            <PopoverTitle>{m.sun_title()}</PopoverTitle>
            <PopoverDescription>
              {up ? m.sun_position({ elevation: Math.round(at.elevation), azimuth: Math.round(at.azimuth) }) : m.sun_below()}
            </PopoverDescription>
          </PopoverHeader>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{m.sun_date()}</span>
            <span>{date}</span>
          </div>
          <Slider aria-label={m.sun_date()} min={1} max={365} value={[sun.day]} onValueChange={v => setSun({ day: Array.isArray(v) ? v[0] : v })} />
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{m.sun_time()}</span>
            <span>{time}</span>
          </div>
          <Slider
            aria-label={m.sun_time()}
            min={0}
            max={1430}
            step={10}
            value={[sun.minutes]}
            onValueChange={v => setSun({ minutes: Array.isArray(v) ? v[0] : v })}
          />
          <Button
            size="xs"
            variant="outline"
            className="self-end"
            onClick={() => {
              const now = new Date();
              setSun({ day: dayOfYear(now), minutes: now.getHours() * 60 + Math.floor(now.getMinutes() / 10) * 10 });
            }}
          >
            {m.sun_now()}
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
