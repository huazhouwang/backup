import { eventSchema, isRunning, newId, sleepKindFor } from '@lullabo/shared'
import { describe, expect, it } from 'vitest'

import {
  deleteEvent,
  logBottle,
  logDiaper,
  logSleep,
  logRecord,
  logSolids,
  moveEventStart,
  restoreEvent,
  setBreastSides,
  setEventNote,
  startBreastFeed,
  startRecord,
  startSleep,
  stopEvent,
  suggestedBreastSide,
  switchBreastSide,
} from './records'

const BABY = newId()
const MINUTE = 60_000
const T0 = new Date(2026, 9, 13, 10, 0).getTime()

describe('duration records', () => {
  it('start any duration kind as a running timer', () => {
    const records = [
      startRecord(BABY, { kind: 'breast', side: 'right' }, T0),
      startRecord(BABY, { kind: 'bottle', amountMl: 90, milk: 'formula' }, T0),
      startRecord(BABY, { kind: 'solids', food: '米粉' }, T0),
      startRecord(BABY, { kind: 'sleep' }, T0),
      startRecord(BABY, { kind: 'pumping', side: 'both' }, T0),
    ]
    for (const record of records) {
      expect(eventSchema.safeParse(record).success).toBe(true)
      expect(isRunning(record)).toBe(true)
    }
  })

  it('start a timer a few minutes back, recorded as made now', () => {
    const record = startRecord(BABY, { kind: 'breast', side: 'left' }, T0 - 10 * MINUTE, T0)
    expect(record.startAt).toBe(T0 - 10 * MINUTE)
    expect(record.type === 'feeding' && record.data).toEqual({
      kind: 'breast',
      segments: [{ side: 'left', startAt: T0 - 10 * MINUTE, endAt: null }],
    })
    // Sync orders changes by when they were made, not when the feed began.
    expect(record).toMatchObject({ createdAt: T0, updatedAt: T0 })
  })

  it('log a breastfeed afterwards with minutes per side, the first side first', () => {
    const sides = { left: 6 * MINUTE, right: 10 * MINUTE }
    const record = logRecord(
      BABY,
      { kind: 'breast', side: 'right', sides },
      T0,
      T0 + 16 * MINUTE,
      T0,
    )
    expect(eventSchema.safeParse(record).success).toBe(true)
    expect(record.type === 'feeding' && record.data).toEqual({
      kind: 'breast',
      segments: [
        { side: 'right', startAt: T0, endAt: T0 + 10 * MINUTE },
        { side: 'left', startAt: T0 + 10 * MINUTE, endAt: T0 + 16 * MINUTE },
      ],
    })
    const oneSide = logRecord(
      BABY,
      { kind: 'breast', side: 'left', sides: { left: 0, right: 8 * MINUTE } },
      T0,
      T0 + 8 * MINUTE,
      T0,
    )
    expect(oneSide.type === 'feeding' && oneSide.data).toEqual({
      kind: 'breast',
      segments: [{ side: 'right', startAt: T0, endAt: T0 + 8 * MINUTE }],
    })
  })

  it('set new minutes per side on a finished breastfeed, from its first side', () => {
    const fed = logRecord(
      BABY,
      { kind: 'breast', side: 'right', sides: { left: 4 * MINUTE, right: 6 * MINUTE } },
      T0,
      T0 + 10 * MINUTE,
      T0,
    )
    if (fed.type !== 'feeding') throw new Error('expected a feed')
    const edited = setBreastSides(fed, { left: 12 * MINUTE, right: 8 * MINUTE }, T0 + MINUTE)
    expect(eventSchema.safeParse(edited).success).toBe(true)
    expect(edited.endAt).toBe(T0 + 20 * MINUTE)
    expect(edited.data.kind === 'breast' && edited.data.segments[0]).toEqual({
      side: 'right',
      startAt: T0,
      endAt: T0 + 8 * MINUTE,
    })
  })

  it('log pumping afterwards with its amount, and a sleep as nap or night by its start', () => {
    const pumping = logRecord(
      BABY,
      { kind: 'pumping', side: 'left', amountMl: 80 },
      T0,
      T0 + 15 * MINUTE,
      T0,
    )
    expect(eventSchema.safeParse(pumping).success).toBe(true)
    const night = new Date(2026, 9, 13, 21, 0).getTime()
    const sleep = logRecord(BABY, { kind: 'sleep' }, night, night + 60 * MINUTE, night)
    expect(sleep.type === 'sleep' && sleep.data.kind).toBe('night')
  })
})

describe('event builders', () => {
  it('produce schema-valid events', () => {
    const events = [
      startBreastFeed(BABY, 'left', T0),
      logBottle(BABY, T0, 90, 'formula'),
      logSolids(BABY, T0, ' 米糊 '),
      startSleep(BABY, T0),
      logSleep(BABY, T0, T0 + 30 * MINUTE, T0 + 31 * MINUTE),
      logDiaper(BABY, T0, 'wet'),
    ]
    for (const event of events) expect(eventSchema.safeParse(event).error).toBeUndefined()
  })

  it('classifies night sleep by local start time', () => {
    expect(sleepKindFor(new Date(2026, 9, 13, 20, 0).getTime())).toBe('night')
    expect(sleepKindFor(new Date(2026, 9, 13, 3, 0).getTime())).toBe('night')
    expect(sleepKindFor(new Date(2026, 9, 13, 13, 0).getTime())).toBe('nap')
  })
})

describe('breastfeeding timer', () => {
  it('switches sides and stops with consistent segments', () => {
    let feed = startBreastFeed(BABY, 'left', T0)
    feed = switchBreastSide(feed, T0 + 10 * MINUTE)
    feed = switchBreastSide(feed, T0 + 15 * MINUTE)
    expect(isRunning(feed)).toBe(true)
    expect(eventSchema.safeParse(feed).success).toBe(true)

    const stopped = stopEvent(feed, T0 + 20 * MINUTE)
    expect(eventSchema.parse(stopped)).toEqual(stopped)
    expect(stopped.endAt).toBe(T0 + 20 * MINUTE)
    expect(stopped.data.kind === 'breast' && stopped.data.segments.map((s) => s.side)).toEqual([
      'left',
      'right',
      'left',
    ])
  })

  it('never produces negative durations when the clock goes backwards', () => {
    const feed = startBreastFeed(BABY, 'left', T0)
    const stopped = stopEvent(switchBreastSide(feed, T0 - MINUTE), T0 - 2 * MINUTE)
    expect(eventSchema.safeParse(stopped).success).toBe(true)
  })

  it('suggests the opposite of the side the last feed ended on', () => {
    expect(suggestedBreastSide(undefined)).toBe('left')
    const lastEndedRight = stopEvent(
      switchBreastSide(startBreastFeed(BABY, 'left', T0), T0 + 1),
      T0 + 2,
    )
    expect(suggestedBreastSide(lastEndedRight)).toBe('left')
    expect(suggestedBreastSide(stopEvent(startBreastFeed(BABY, 'left', T0), T0 + 1))).toBe('right')
  })
})

describe('stopEvent', () => {
  it('stops a running sleep and leaves finished events alone', () => {
    const stopped = stopEvent(startSleep(BABY, T0), T0 + 45 * MINUTE)
    expect(stopped.endAt).toBe(T0 + 45 * MINUTE)
    expect(stopEvent(stopped, T0 + 99 * MINUTE)).toBe(stopped)
  })
})

describe('editing', () => {
  it('moves a breastfeed with its segments and keeps it valid', () => {
    const feed = stopEvent(
      switchBreastSide(startBreastFeed(BABY, 'left', T0), T0 + 10 * MINUTE),
      T0 + 15 * MINUTE,
    )
    const moved = moveEventStart(feed, T0 - 60 * MINUTE, T0 + 20 * MINUTE)
    expect(eventSchema.parse(moved)).toEqual(moved)
    expect(moved.endAt).toBe(T0 - 45 * MINUTE)
  })

  it('moves the start of a running breastfeed', () => {
    const moved = moveEventStart(startBreastFeed(BABY, 'left', T0), T0 - 5 * MINUTE, T0)
    expect(eventSchema.safeParse(moved).success).toBe(true)
    expect(isRunning(moved)).toBe(true)
  })

  it('normalizes empty notes to null', () => {
    const diaper = logDiaper(BABY, T0, 'wet')
    expect(setEventNote(diaper, '  ', T0).note).toBeNull()
    expect(setEventNote(diaper, ' 有点红 ', T0).note).toBe('有点红')
  })

  it('soft deletes and restores', () => {
    const diaper = logDiaper(BABY, T0, 'wet')
    const deleted = deleteEvent(diaper, T0 + MINUTE)
    expect(deleted.deletedAt).toBe(T0 + MINUTE)
    expect(eventSchema.safeParse(deleted).success).toBe(true)
    expect(restoreEvent(deleted, T0 + 2 * MINUTE).deletedAt).toBeNull()
  })
})
