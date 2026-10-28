import { type Event, HOUR, hasDuration, hasKnownDuration, isRunning } from '@lullabo/shared'
import { cn } from '@lullabo/ui/utils'

import { formatTime } from '../../lib/i18n'
import { m } from '../../paraglide/messages.js'
import { CATEGORY_LOOK, laneOf } from './category'
import { describeEvent } from './describe'

const HOUR_PX = 40
const MIN_BLOCK_PX = 10
const LANES = ['feeding', 'sleep', 'diaper', 'other'] as const
const laneTitles = {
  feeding: m.categoryFeeding,
  sleep: m.categorySleep,
  diaper: m.categoryDiaper,
  other: m.categoryOther,
}

/** Vertical 24-hour timeline with one lane per category; tap a block to edit it. */
export function DayTimeline({
  events,
  dayStart,
  dayEnd,
  now,
  onSelect,
}: {
  events: readonly Event[]
  dayStart: number
  dayEnd: number
  now: number
  onSelect: (event: Event) => void
}) {
  const visible = events.filter(
    (event) =>
      event.startAt < dayEnd &&
      (event.endAt ?? (hasDuration(event) ? now : event.startAt)) >= dayStart,
  )
  const hours = Math.round((dayEnd - dayStart) / HOUR)
  const toPx = (at: number) =>
    ((Math.min(Math.max(at, dayStart), dayEnd) - dayStart) / HOUR) * HOUR_PX
  const showNow = now >= dayStart && now < dayEnd

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-title font-extrabold">{m.timelineTitle()}</h2>
      {visible.length === 0 && <p className="text-muted-foreground">{m.dayEmpty()}</p>}
      <div aria-hidden className="flex">
        <div className="w-12 shrink-0" />
        <div className="grid flex-1 grid-cols-4 gap-2 text-center text-caption font-bold text-muted-foreground">
          {LANES.map((lane) => (
            <span key={lane}>{laneTitles[lane]()}</span>
          ))}
        </div>
      </div>
      <div className="relative flex" style={{ height: hours * HOUR_PX }}>
        <div aria-hidden className="w-12 shrink-0">
          {Array.from({ length: hours }, (_, hour) => (
            <div
              key={hour}
              className="relative border-t border-border text-caption text-muted-foreground tabular-nums"
              style={{ height: HOUR_PX }}
            >
              {hour % 3 === 0 && (
                <span className="absolute -top-2.5 bg-background pr-1">
                  {String(hour).padStart(2, '0')}
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="relative grid flex-1 grid-cols-4 gap-2">
          {LANES.map((lane) => (
            <div key={lane} className="relative rounded-md bg-muted">
              {visible
                .filter((event) => laneOf(event.type) === lane)
                .map((event) => {
                  const top = toPx(event.startAt)
                  const end = event.endAt ?? (hasDuration(event) ? now : event.startAt)
                  const height = Math.max(toPx(end) - top, MIN_BLOCK_PX)
                  const { title, detail } = describeEvent(event, now)
                  // Instant records (and durations not recorded) are dots; the rest are bars.
                  const dot = !isRunning(event) && !hasKnownDuration(event)
                  return (
                    <button
                      key={event.id}
                      type="button"
                      aria-label={`${formatTime(event.startAt)} ${title} ${detail}`}
                      onClick={() => onSelect(event)}
                      className={cn(
                        'absolute border-2 border-background',
                        dot ? 'left-1/2 -translate-x-1/2 rounded-full' : 'inset-x-1 rounded-sm',
                        CATEGORY_LOOK[event.type].dot,
                        isRunning(event) && 'animate-pulse',
                      )}
                      style={{
                        top,
                        height: dot ? MIN_BLOCK_PX + 4 : height,
                        width: dot ? MIN_BLOCK_PX + 4 : undefined,
                      }}
                    />
                  )
                })}
            </div>
          ))}
          {showNow && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 h-0.5 bg-destructive"
              style={{ top: toPx(now) }}
            />
          )}
        </div>
      </div>
    </section>
  )
}
