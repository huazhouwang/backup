import { type Event, MINUTE, isRunning } from '@lullabo/shared'

/** When a record ended: never yet while it runs, at its start for one-off records. */
const endedAt = (event: Event) =>
  isRunning(event) ? Number.POSITIVE_INFINITY : (event.endAt ?? event.startAt)

/**
 * Newest first by start. Within one minute, the one that ended later (or still runs) comes
 * first: a diaper changed at 00:38 and a sleep from 00:38 list the sleep on top, as it came
 * after.
 */
export function newestFirst(a: Event, b: Event): number {
  const byMinute = Math.floor(b.startAt / MINUTE) - Math.floor(a.startAt / MINUTE)
  if (byMinute !== 0) return byMinute
  if (endedAt(a) !== endedAt(b)) return endedAt(b) > endedAt(a) ? 1 : -1
  return b.startAt - a.startAt
}
