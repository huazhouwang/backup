import { MINUTE } from '@bobo/shared'
import { describe, expect, it } from 'vitest'

import { checkTimes, newTimes, resolveTimes, storedTimes, timesReducer } from './duration-times'

const NOW = new Date(2026, 9, 23, 10, 0).getTime()

describe('timesReducer', () => {
  it('takes a new record to have just ended until a start is picked', () => {
    const times = newTimes('sleep', 60, 'left')
    expect(resolveTimes(times, NOW)).toEqual({ startAt: NOW - 60 * MINUTE, endAt: NOW })
    // A new duration keeps the end at now.
    const longer = timesReducer(times, { type: 'minutes', minutes: 90 })
    expect(resolveTimes(longer, NOW)).toEqual({ startAt: NOW - 90 * MINUTE, endAt: NOW })
  })

  it('works the start out back from when it ended, until a start is picked', () => {
    let times = timesReducer(newTimes('bottle', 15, 'left'), { type: 'endedAgo', minutes: 30 })
    expect(resolveTimes(times, NOW)).toEqual({
      startAt: NOW - 45 * MINUTE,
      endAt: NOW - 30 * MINUTE,
    })
    // A new duration keeps the end; so does a new end typed in.
    times = timesReducer(times, { type: 'minutes', minutes: 20 })
    expect(resolveTimes(times, NOW).endAt).toBe(NOW - 30 * MINUTE)
    times = timesReducer(times, { type: 'end', at: NOW - 60 * MINUTE, now: NOW })
    expect(times.endedAgo).toBe(60)
    expect(resolveTimes(times, NOW).startAt).toBe(NOW - 80 * MINUTE)
  })

  it('keeps the duration when a picked start moves, and the start when the duration changes', () => {
    let times = timesReducer(newTimes('bottle', 15, 'left'), {
      type: 'start',
      at: NOW - 60 * MINUTE,
    })
    expect(times.endedAgo).toBeNull()
    expect(resolveTimes(times, NOW).endAt).toBe(NOW - 45 * MINUTE)
    times = timesReducer(times, { type: 'minutes', minutes: 30 })
    expect(resolveTimes(times, NOW).endAt).toBe(NOW - 30 * MINUTE)
    times = timesReducer(times, { type: 'start', at: NOW - 120 * MINUTE })
    expect(resolveTimes(times, NOW).endAt).toBe(NOW - 90 * MINUTE)
  })

  it('changes the duration from a new end, or moves the start for an end before it', () => {
    const start = NOW - 60 * MINUTE
    let times = storedTimes('pumping', start, 15 * MINUTE, null, 'left')
    times = timesReducer(times, { type: 'end', at: start + 25 * MINUTE, now: NOW })
    expect(times.minutes).toBe(25)
    times = timesReducer(times, { type: 'end', at: start - 10 * MINUTE, now: NOW })
    expect(resolveTimes(times, NOW)).toEqual({
      startAt: start - 35 * MINUTE,
      endAt: start - 10 * MINUTE,
    })
  })

  it('takes a breastfeed’s new end from the side fed last', () => {
    const start = NOW - 60 * MINUTE
    const times = storedTimes(
      'breast',
      start,
      20 * MINUTE,
      { left: 12 * MINUTE, right: 8 * MINUTE },
      'left',
    )
    const ended = timesReducer(times, { type: 'end', at: start + 30 * MINUTE, now: NOW })
    expect(ended.sides).toEqual({ left: 12, right: 18 })
  })

  it('refuses times in the future and a missing duration where one is needed', () => {
    const times = timesReducer(newTimes('sleep', 60, 'left'), { type: 'minutes', minutes: null })
    expect(checkTimes(times, NOW, true)).toEqual({ duration: expect.any(String) })
    const future = timesReducer(newTimes('sleep', 60, 'left'), { type: 'start', at: NOW })
    expect(checkTimes(future, NOW, true)).toEqual({ end: expect.any(String) })
  })
})
