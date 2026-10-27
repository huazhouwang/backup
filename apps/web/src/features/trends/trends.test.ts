import { newId } from '@lullabo/shared'
import { describe, expect, it } from 'vitest'

import { logBottle, logDiaper, logSleep } from '../events/records'
import { dailyTrends, dayStarts } from './trends'

const BABY = newId()
const H = 3_600_000
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime()

describe('dailyTrends', () => {
  it('lists the last N local days ending today', () => {
    const starts = dayStarts(3, at(14, 15))
    expect(starts).toEqual([at(12, 0), at(13, 0), at(14, 0)])
  })

  it('totals each day and averages feed intervals and wake windows', () => {
    const events = [
      logBottle(BABY, at(13, 6), 100, 'formula'),
      logBottle(BABY, at(13, 9), 120, 'formula'),
      logBottle(BABY, at(13, 13), 90, 'formula'),
      logBottle(BABY, at(14, 7), 110, 'formula'),
      logSleep(BABY, at(13, 10), at(13, 11), at(13, 11)),
      logSleep(BABY, at(13, 13), at(13, 14), at(13, 14)),
      logSleep(BABY, at(13, 16), at(13, 17), at(13, 17)),
      logDiaper(BABY, at(14, 8), 'wet'),
    ]
    const [yesterday, today] = dailyTrends(events, 2, at(14, 12))
    expect(yesterday).toMatchObject({
      day: '2026-10-13',
      feedings: 3,
      bottleMl: 310,
      sleepMs: 3 * H,
      diapers: 0,
      feedIntervalMs: 3.5 * H,
      wakeWindowMs: 2 * H,
    })
    // 13:00 -> 07:00 is 18 hours: a gap in logging, not an interval.
    expect(today).toMatchObject({
      feedings: 1,
      diapers: 1,
      feedIntervalMs: null,
      wakeWindowMs: null,
    })
  })
})
