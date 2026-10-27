import { newId } from '@lullabo/shared'
import { describe, expect, it } from 'vitest'

import {
  deleteEvent,
  logBottle,
  logDiaper,
  logMedication,
  logNote,
  logPumping,
  logSleep,
  logTemperature,
  startBreastFeed,
  startSleep,
  stopEvent,
  switchBreastSide,
} from './records'
import { lastActivityAt, onDayList, summarizeDay } from './summary'

const BABY = newId()
const MIN = 60_000
const H = 60 * MIN
const DAY_START = new Date(2026, 9, 13).getTime()
const DAY_END = new Date(2026, 9, 14).getTime()
const at = (hour: number, minute = 0) => new Date(2026, 9, 13, hour, minute).getTime()

describe('summarizeDay', () => {
  it('totals feeds, sleep and diapers for the day', () => {
    const breast = stopEvent(
      switchBreastSide(startBreastFeed(BABY, 'left', at(8)), at(8, 10)),
      at(8, 15),
    )
    const events = [
      breast,
      logBottle(BABY, at(11), 90, 'formula'),
      logBottle(BABY, at(15), 120, 'breast'),
      logSleep(BABY, at(9), at(10, 30), at(10, 30)),
      logSleep(BABY, at(13), at(13, 45), at(13, 45)),
      logDiaper(BABY, at(7), 'wet'),
      logDiaper(BABY, at(12), 'dirty'),
      deleteEvent(logDiaper(BABY, at(14), 'wet'), at(14)),
    ]
    expect(summarizeDay(events, DAY_START, DAY_END, at(23))).toEqual({
      feedings: 3,
      bottleMl: 210,
      bottleBreastMl: 120,
      bottleFormulaMl: 90,
      breastMs: 15 * MIN,
      sleepMs: 135 * MIN,
      naps: 2,
      longestSleepMs: 90 * MIN,
      diapers: { wet: 1, dirty: 1, mixed: 0 },
      pumpingMl: 0,
      latestCelsius: null,
      medications: 0,
      notes: 0,
    })
  })

  it('splits bottle volume into breast milk and formula', () => {
    const events = [
      logBottle(BABY, at(8), 100, 'breast'),
      logBottle(BABY, at(11), 120, 'mixed', at(11), { breastMl: 70, formulaMl: 50 }),
      // Mixed without a split counts toward the total only.
      logBottle(BABY, at(14), 90, 'mixed'),
    ]
    expect(summarizeDay(events, DAY_START, DAY_END, at(23))).toMatchObject({
      bottleMl: 310,
      bottleBreastMl: 170,
      bottleFormulaMl: 50,
    })
  })

  it('totals pumping, medication and notes and keeps the latest temperature', () => {
    const events = [
      logPumping(BABY, at(6), 'both', 150),
      logPumping(BABY, at(18), 'left', 60),
      logTemperature(BABY, at(20), 37.2),
      logTemperature(BABY, at(9), 38.4),
      logMedication(BABY, at(9, 5), '布洛芬', '2.5 毫升'),
      logNote(BABY, at(16), '第一次翻身'),
    ]
    expect(summarizeDay(events, DAY_START, DAY_END, at(23))).toMatchObject({
      feedings: 0,
      pumpingMl: 210,
      latestCelsius: 37.2,
      medications: 1,
      notes: 1,
    })
  })

  it('splits a night across midnight and counts running sleep up to now', () => {
    const lastNight = logSleep(BABY, at(0) - 2 * H, at(6), at(6))
    const running = startSleep(BABY, at(20))
    const summary = summarizeDay([lastNight, running], DAY_START, DAY_END, at(21))
    expect(summary.sleepMs).toBe(6 * H + H)
    expect(summary.naps).toBe(0)
  })

  it('ignores events from other days', () => {
    const yesterday = logBottle(BABY, DAY_START - H, 60, 'formula')
    expect(summarizeDay([yesterday], DAY_START, DAY_END, at(12)).feedings).toBe(0)
  })
})

describe('lastActivityAt', () => {
  it('counts sleeps from waking up and everything else from its start', () => {
    const events = [
      logSleep(BABY, at(9), at(10), at(10)),
      logDiaper(BABY, at(11), 'wet'),
      logDiaper(BABY, at(8), 'wet'),
    ]
    expect(lastActivityAt(events, 'sleep', at(12))).toBe(at(10))
    expect(lastActivityAt(events, 'diaper', at(12))).toBe(at(11))
    expect(lastActivityAt(events, 'feeding', at(12))).toBeUndefined()
    // Feeds are spaced start to start, however long they took.
    const feed = logBottle(BABY, at(9), 120, 'formula', at(9, 30), undefined, 20 * MIN)
    expect(lastActivityAt([feed], 'feeding', at(12))).toBe(at(9))
  })
})

describe('onDayList', () => {
  it('lists a sleep on the day it started and the day it ran into', () => {
    const night = logSleep(BABY, at(23) - 24 * H, at(5), at(5))
    expect(onDayList(night, DAY_START, DAY_END, at(9))).toBe(true)
    expect(onDayList(night, DAY_START - 24 * H, DAY_START, at(9))).toBe(true)
    // An instant record stays on its own day.
    expect(onDayList(logDiaper(BABY, at(23) - 24 * H, 'wet'), DAY_START, DAY_END, at(9))).toBe(
      false,
    )
  })
})
