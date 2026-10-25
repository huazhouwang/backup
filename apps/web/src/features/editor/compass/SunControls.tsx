/**
 * The day and time the sun stands at, as SketchUp's shadow settings: a sun button among the 3D tools (or a tap on the sun in the
 * sky, see Sun3D) opens the date and time; the sun in the sky, its light and the shadows follow.
 */
import { SunIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { getLocale, htmlLang, m } from '@/lib/i18n';
import { dateOfDay, dayOfYear, sunPosition } from '@/lib/solar';
import { useEditor } from '../store';

export function SunControls() {
  const site = useEditor(s => s.project.site);
  const sun = useEditor(s => s.sun);
  const setSun = useEditor(s => s.setSun);
  const open = useEditor(s => s.sunOpen);
  const setOpen = useEditor(s => s.setSunOpen);
  const at = sunPosition(site.location, sun.day, sun.minutes);
  const time = `${String(Math.floor(sun.minutes / 60)).padStart(2, '0')}:${String(sun.minutes % 60).padStart(2, '0')}`;
  const date = dateOfDay(sun.day).toLocaleDateString(htmlLang(getLocale()), { month: 'long', day: 'numeric' });
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button size="sm" variant="outline" className="bg-background aria-expanded:bg-accent" aria-label={m.sun_open()} />}>
        <SunIcon />
        <span className="max-md:hidden">{time}</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <PopoverHeader>
          <PopoverTitle>{m.sun_title()}</PopoverTitle>
          <PopoverDescription>
            {at.elevation > 0 ? m.sun_position({ elevation: Math.round(at.elevation), azimuth: Math.round(at.azimuth) }) : m.sun_below()}
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
  );
}
