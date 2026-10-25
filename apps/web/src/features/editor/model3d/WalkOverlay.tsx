/**
 * Drawn over the view while walking: a crosshair in the middle, and on a touch screen the joystick where the walking finger
 * landed, its knob following the push (see WalkView).
 */
import { m } from '@/lib/i18n';
import { JOY_REACH, useWalkPad } from './WalkView';

export function WalkOverlay() {
  const joy = useWalkPad();
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute top-1/2 left-1/2 size-3.5 -translate-1/2 rounded-full border-2 border-background mix-blend-difference" />
      {joy && (
        <div
          role="slider"
          aria-label={m.walk_joystick()}
          aria-valuenow={Math.round((-joy.dy / JOY_REACH) * 100)}
          className="absolute size-28 -translate-1/2 rounded-full bg-foreground/15 ring-2 ring-background/70"
          style={{ left: joy.x, top: joy.y }}
        >
          <div
            className="absolute top-1/2 left-1/2 size-11 rounded-full bg-background/85 shadow-md"
            style={{ transform: `translate(calc(-50% + ${joy.dx}px), calc(-50% + ${joy.dy}px))` }}
          />
        </div>
      )}
    </div>
  );
}
