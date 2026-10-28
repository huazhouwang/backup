import { HOUR, startOfLocalDay } from '@lullabo/shared'
import { bottleEvent, breastEvent, sleepEvent } from '@lullabo/shared/testing'
import { describe, expect, it } from 'vitest'

import { compareWithUsual } from './compare'

const now = new Date(2026, 9, 25, 15).getTime()
const dayAgo = (n: number, hour: number) => startOfLocalDay(now, -n) + hour * HOUR
const bottle = (at: number, amountMl: number) => bottleEvent(at, { minutes: 15, amountMl })
const breast = (at: number) => breastEvent(at)
const sleep = (from: number, hours: number) => sleepEvent(from, from + hours * HOUR)

/** A fully logged day `n` days ago: six 130 ml bottles and 14 hours of sleep. */
const loggedDay = (n: number) => [
  ...[6, 9, 12, 15, 18, 21].map((hour) => bottle(dayAgo(n, hour), 130)),
  sleep(dayAgo(n, 0), 6),
  sleep(dayAgo(n, 7), 2),
  sleep(dayAgo(n, 13), 2),
  sleep(dayAgo(n, 20), 4),
]

describe('compareWithUsual', () => {
  it('compares a well-logged week with the usual range for the age', () => {
    const events = [1, 2, 3, 4, 5].flatMap(loggedDay)
    expect(compareWithUsual(events, 4.5, now)).toEqual([
      { kind: 'milk', value: 780, usual: [700, 960], verdict: 'usual', days: 5 },
      { kind: 'sleep', value: 14, usual: [12, 16], verdict: 'usual', days: 5 },
    ])
  })

  it('says nothing from too few logged days, or from days that look half logged', () => {
    expect(compareWithUsual([1, 2].flatMap(loggedDay), 4.5, now)).toEqual([])
    // A bottle or a nap now and then isn't a day's eating or sleeping.
    const sparse = [1, 2, 3, 4, 5].flatMap((n) => [
      bottle(dayAgo(n, 9), 120),
      sleep(dayAgo(n, 13), 1),
    ])
    expect(compareWithUsual(sparse, 4.5, now)).toEqual([])
  })

  it('leaves daily milk out when breastfeeding is logged, as it has no amount', () => {
    const events = [...[1, 2, 3, 4].flatMap(loggedDay), breast(dayAgo(1, 2))]
    expect(compareWithUsual(events, 4.5, now).map((item) => item.kind)).toEqual(['sleep'])
  })

  it('ignores today, still going, and anything older than a week', () => {
    const events = [0, 8, 9, 10].flatMap(loggedDay)
    expect(compareWithUsual(events, 4.5, now)).toEqual([])
  })
})
