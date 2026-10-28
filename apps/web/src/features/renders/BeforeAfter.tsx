/**
 * A render over the model it was made from (issue 195): drag across the image, or use the slider, to wipe between the clean 3D
 * view (left) and the styled image (right)
 */
import { useRef, useState } from 'react';
import { Slider } from '@/components/ui/slider';
import { m } from '@/lib/i18n';
import { cn } from 'cn';

export function BeforeAfter({ before, after, alt, className }: { before: string; after: string; alt: string; className?: string }) {
  const [at, setAt] = useState(50);
  const box = useRef<HTMLDivElement>(null);
  const drag = (e: React.PointerEvent) => {
    if (e.type === 'pointermove' && !e.buttons) return;
    const r = box.current!.getBoundingClientRect();
    setAt(Math.round(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100))));
  };
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div
        ref={box}
        className="relative cursor-ew-resize touch-none overflow-hidden rounded-md select-none"
        onPointerDown={e => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag(e);
        }}
        onPointerMove={drag}
      >
        <img src={after} alt={alt} className="block w-full" draggable={false} />
        <img
          src={before}
          alt={m.render_before_alt()}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ clipPath: `inset(0 ${100 - at}% 0 0)` }}
          draggable={false}
        />
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-background shadow" style={{ left: `${at}%` }} />
        <span className="pointer-events-none absolute top-2 left-2 rounded bg-background/80 px-1.5 py-0.5 text-xs">{m.render_before()}</span>
        <span className="pointer-events-none absolute top-2 right-2 rounded bg-background/80 px-1.5 py-0.5 text-xs">{m.render_after()}</span>
      </div>
      <Slider value={[at]} onValueChange={v => setAt(Array.isArray(v) ? v[0] : v)} aria-label={m.render_compare()} />
    </div>
  );
}
