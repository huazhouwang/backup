import { type Event, HOUR, localDateString, startOfLocalDay } from '@lullabo/shared'

import { summarizeDay } from '../events/summary'

export interface DayTrend {
  /** Local date, "YYYY-MM-DD". */
  day: string
  dayStart: number
  feedings: number
  bottleMl: number
  sleepMs: number
  diapers: number
  /** Average gap between consecutive feeds starting this day; null without one. */
  feedIntervalMs: number | null
  /** Average awake time between sleeps, for windows starting this day. */
  wakeWindowMs: number | null
}

/** Local midnights of the `days` days ending with the day containing `now` (DST-safe). */
export function dayStarts(days: number, now: number): number[] {
  return Array.from({ length: days }, (_, i) => startOfLocalDay(now, i - (days - 1)))
}

const average = (values: number[]) =>
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length

/** Gaps longer than this are missing data (e.g. a day without logging), not real intervals. */
const MAX_GAP_MS = 12 * HOUR

const within = (gaps: { at: number; ms: number }[], start: number, end: number) =>
  gaps
    .filter((gap) => gap.at >= start && gap.at < end && gap.ms > 0 && gap.ms <= MAX_GAP_MS)
    .map((gap) => gap.ms)

/**
 * Per-day series for the trend charts, computed on the device. Gaps are attributed to the day
 * they start: a feed interval to the day of the later feed, a wake window to the day the
 * baby woke up.
 */
export function dailyTrends(events: readonly Event[], days: number, now: number): DayTrend[] {
  const starts = dayStarts(days, now)
  const live = events.filter((event) => event.deletedAt === null)
  const feeds = live
    .filter((event) => event.type === 'feeding')
    .toSorted((a, b) => a.startAt - b.startAt)
  const sleeps = live
    .filter((event) => event.type === 'sleep' && event.endAt !== null)
    .toSorted((a, b) => a.startAt - b.startAt)

  const feedGaps: { at: number; ms: number }[] = []
  for (let i = 1; i < feeds.length; i += 1) {
    const prev = feeds[i - 1]
    const next = feeds[i]
    if (prev && next) feedGaps.push({ at: next.startAt, ms: next.startAt - prev.startAt })
  }
  const wakeGaps: { at: number; ms: number }[] = []
  for (let i = 1; i < sleeps.length; i += 1) {
    const prev = sleeps[i - 1]
    const next = sleeps[i]
    if (prev?.endAt != null && next)
      wakeGaps.push({ at: prev.endAt, ms: next.startAt - prev.endAt })
  }
  return starts.map((dayStart) => {
    const date = new Date(dayStart)
    const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime()
    const summary = summarizeDay(live, dayStart, dayEnd, now)
    return {
      day: localDateString(dayStart),
      dayStart,
      feedings: summary.feedings,
      bottleMl: summary.bottleMl,
      sleepMs: summary.sleepMs,
      diapers: summary.diapers.wet + summary.diapers.dirty + summary.diapers.mixed,
      feedIntervalMs: average(within(feedGaps, dayStart, dayEnd)),
      wakeWindowMs: average(within(wakeGaps, dayStart, dayEnd)),
    }
  })
}
