import { type Event, HOUR, ageNorms } from '@bobo/shared'

import { dailyTrends } from '../trends/trends'

/** Complete days looked at: the last week, not today, which is still going. */
const DAYS = 7
/** A comparison needs at least this many days that look fully logged. */
const MIN_DAYS = 3

export type Verdict = 'usual' | 'below' | 'above'

export interface Comparison {
  kind: 'milk' | 'sleep'
  /** The average over the days that count, in ml or hours. */
  value: number
  usual: [number, number]
  verdict: Verdict
  /** How many days the average is over. */
  days: number
}

const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length

const verdictOf = (value: number, [low, high]: [number, number]): Verdict =>
  value < low ? 'below' : value > high ? 'above' : 'usual'

/**
 * The baby's last week next to what is usual at their age. Families don't log everything,
 * so a day only counts towards a measure when it looks fully logged for it (feeds at least
 * half the usual number, sleep at least half the usual hours), and a measure shows only with
 * enough such days. Daily milk is left out when breastfeeding is logged: those feeds have no
 * amount, so the total would look low. The number of feeds isn't compared: top-ups and
 * solids are logged as feeds of their own, so it says more about logging than eating.
 */
export function compareWithUsual(events: readonly Event[], months: number, now: number) {
  const usual = ageNorms(months)
  const days = dailyTrends(events, DAYS + 1, now).slice(0, DAYS)
  const since = days[0]?.dayStart ?? now
  const breastfed = events.some(
    (event) =>
      event.deletedAt === null &&
      event.type === 'feeding' &&
      event.data.kind === 'breast' &&
      event.startAt >= since,
  )
  const fedDays = days.filter((day) => day.feedings >= usual.feedsPerDay[0] / 2)
  const sleptDays = days.filter((day) => day.sleepMs >= (usual.sleepHoursPerDay[0] / 2) * HOUR)

  const comparisons: Comparison[] = []
  if (fedDays.length >= MIN_DAYS) {
    const milkDays = fedDays.filter((day) => day.bottleMl > 0)
    if (!breastfed && milkDays.length >= MIN_DAYS) {
      const value = Math.round(average(milkDays.map((day) => day.bottleMl)) / 10) * 10
      comparisons.push({
        kind: 'milk',
        value,
        usual: usual.milkMlPerDay,
        verdict: verdictOf(value, usual.milkMlPerDay),
        days: milkDays.length,
      })
    }
  }
  if (sleptDays.length >= MIN_DAYS) {
    const hours = Math.round((average(sleptDays.map((day) => day.sleepMs)) / HOUR) * 2) / 2
    comparisons.push({
      kind: 'sleep',
      value: hours,
      usual: usual.sleepHoursPerDay,
      verdict: verdictOf(hours, usual.sleepHoursPerDay),
      days: sleptDays.length,
    })
  }
  return comparisons
}
