/**
 * The walking joystick, for a phone where there are no keys: pushing the knob walks forward, back and sideways, further for faster,
 * like the joystick of SketchUp's mobile viewer. Dragging elsewhere still looks around (see WalkView).
 */
import { useRef, useState } from 'react';
import { m } from '@/lib/i18n';
import { walkStick } from './WalkView';

/** How far the knob travels from the middle (px) */
const REACH = 36;

export function WalkJoystick({ className }: { className?: string }) {
  const [knob, setKnob] = useState<[number, number]>([0, 0]);
  const centre = useRef<[number, number] | null>(null);
  const push = (x: number, y: number) => {
    const c = centre.current;
    if (!c) return;
    let dx = x - c[0],
      dy = y - c[1];
    const len = Math.hypot(dx, dy);
    if (len > REACH) [dx, dy] = [(dx / len) * REACH, (dy / len) * REACH];
    setKnob([dx, dy]);
    walkStick.forward = -dy / REACH;
    walkStick.right = dx / REACH;
    walkStick.wake();
  };
  const release = () => {
    centre.current = null;
    setKnob([0, 0]);
    walkStick.forward = 0;
    walkStick.right = 0;
  };
  return (
    <div
      role="slider"
      aria-label={m.walk_joystick()}
      aria-valuenow={Math.round(walkStick.forward * 100)}
      className={`${className ?? ''} size-28 touch-none rounded-full bg-background/70 ring-1 ring-foreground/15 backdrop-blur-sm select-none`}
      onPointerDown={e => {
        const r = e.currentTarget.getBoundingClientRect();
        centre.current = [r.left + r.width / 2, r.top + r.height / 2];
        e.currentTarget.setPointerCapture(e.pointerId);
        push(e.clientX, e.clientY);
      }}
      onPointerMove={e => push(e.clientX, e.clientY)}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <div
        className="pointer-events-none absolute top-1/2 left-1/2 size-12 rounded-full bg-foreground/80 shadow-md"
        style={{ transform: `translate(calc(-50% + ${knob[0]}px), calc(-50% + ${knob[1]}px))` }}
      />
    </div>
  );
}
