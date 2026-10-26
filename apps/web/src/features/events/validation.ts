import type { Event } from '@bobo/shared'

import { formatTime } from '../../lib/i18n'
import { m } from '../../paraglide/messages.js'
import { formatDayTime, fromDateTimeLocal } from './time'

/** Small allowance so "now" picked in the form is not rejected a few seconds later. */
const FUTURE_TOLERANCE_MS = 60_000

export function validateTime(value: string, now: number): { at: number } | { error: string } {
  const at = fromDateTimeLocal(value)
  if (Number.isNaN(at)) return { error: m.timeInvalid() }
  if (at > now + FUTURE_TOLERANCE_MS) return { error: m.timeInFuture() }
  return { at: Math.min(at, now) }
}

/** The other sleep of the same baby [startAt, endAt] overlaps, if any (running ones count to now). */
export function clashingSleep(
  events: readonly Event[],
  startAt: number,
  endAt: number,
  now: number,
  ignoreId?: string,
): Event | undefined {
  return events.find(
    (event) =>
      event.type === 'sleep' &&
      event.id !== ignoreId &&
      event.deletedAt === null &&
      event.startAt < endAt &&
      (event.endAt ?? now) > startAt,
  )
}

/** Whether [startAt, endAt] overlaps another sleep of the same baby. */
export const overlapsSleep = (...args: Parameters<typeof clashingSleep>) =>
  clashingSleep(...args) !== undefined

/** Says which sleep a new or changed one overlaps, so it isn't taken for itself. */
export function sleepOverlapMessage(clash: Event, now: number): string {
  const from = formatDayTime(clash.startAt, now)
  return clash.endAt === null
    ? m.sleepOverlapRunning({ from })
    : m.sleepOverlap({ from, to: formatTime(clash.endAt) })
}
