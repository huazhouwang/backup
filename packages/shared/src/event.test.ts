import { describe, expect, it } from 'vitest'

import {
  EVENT_TYPES,
  breastSideDurations,
  eventDurationMs,
  eventSchema,
  hasDuration,
  hasKnownDuration,
  isRunning,
} from './event'
import { MINUTE, T0, baseEvent } from './testing'

const sleep = (endAt: number | null) => ({
  ...baseEvent(),
  type: 'sleep',
  startAt: T0,
  endAt,
  data: { kind: 'nap' },
})

const breast = (
  segments: { side: string; startAt: number; endAt: number | null }[],
  endAt: number | null,
) => ({
  ...baseEvent(),
  type: 'feeding',
  startAt: T0,
  endAt,
  data: { kind: 'breast', segments },
})

const instant = (type: string, data: unknown, note: string | null = null) =>
  eventSchema.safeParse({ ...baseEvent(), type, startAt: T0, endAt: null, note, data }).success

const mixedBottle = (data: object) =>
  instant('feeding', { kind: 'bottle', amountMl: 120, milk: 'mixed', ...data })

/** An event that ended 15 minutes after it started. */
const finished = (type: string, data: unknown) => ({
  ...baseEvent(),
  type,
  startAt: T0,
  endAt: T0 + 15 * MINUTE,
  data,
})

describe('eventSchema', () => {
  it('accepts each event type', () => {
    expect(eventSchema.safeParse(sleep(T0 + 30 * MINUTE)).success).toBe(true)
    expect(
      eventSchema.safeParse({
        ...baseEvent(),
        type: 'diaper',
        startAt: T0,
        endAt: null,
        data: { contents: 'wet' },
      }).success,
    ).toBe(true)
    expect(
      eventSchema.safeParse({
        ...baseEvent(),
        type: 'feeding',
        startAt: T0,
        endAt: null,
        data: { kind: 'bottle', amountMl: 90, milk: 'formula' },
      }).success,
    ).toBe(true)
  })

  it('accepts pumping, temperature, medication and notes', () => {
    expect(instant('pumping', { side: 'both', amountMl: 120 })).toBe(true)
    expect(instant('temperature', { celsius: 37.4 })).toBe(true)
    expect(instant('medication', { name: '布洛芬', dose: '2.5 ml' })).toBe(true)
    expect(instant('medication', { name: '维生素 D', dose: null })).toBe(true)
    expect(instant('note', {}, '今天第一次翻身')).toBe(true)

    expect(instant('temperature', { celsius: 50 })).toBe(false)
    expect(instant('medication', { name: ' ', dose: null })).toBe(false)
    expect(instant('pumping', { side: 'left', amountMl: 0 })).toBe(false)
    expect(instant('note', {})).toBe(false)
    expect(instant('growth', { weightKg: 5.2, lengthCm: null, headCm: 38 })).toBe(true)
    expect(instant('growth', { weightKg: null, lengthCm: null, headCm: null })).toBe(false)
    expect(instant('growth', { weightKg: 500, lengthCm: null, headCm: null })).toBe(false)
  })

  it('accepts mixed bottles split into breast milk and formula that add up', () => {
    expect(mixedBottle({})).toBe(true)
    expect(mixedBottle({ breastMl: 70, formulaMl: 50 })).toBe(true)
    expect(mixedBottle({ breastMl: 70, formulaMl: 60 })).toBe(false)
    expect(mixedBottle({ breastMl: 70 })).toBe(false)
    expect(mixedBottle({ milk: 'formula', breastMl: 70, formulaMl: 50 })).toBe(false)
  })

  it('accepts pee and poop details only for diapers that have them', () => {
    const poop = { amount: 'normal', color: 'yellow', consistency: 'soft' }
    expect(instant('diaper', { contents: 'dirty', poop })).toBe(true)
    expect(instant('diaper', { contents: 'mixed', poop })).toBe(true)
    expect(instant('diaper', { contents: 'dirty' })).toBe(true)
    expect(instant('diaper', { contents: 'wet', poop })).toBe(false)
    const pee = { amount: 'large' }
    expect(instant('diaper', { contents: 'wet', pee })).toBe(true)
    expect(instant('diaper', { contents: 'mixed', pee, poop })).toBe(true)
    expect(instant('diaper', { contents: 'dirty', pee, poop })).toBe(false)
    expect(instant('diaper', { contents: 'wet', pee: { amount: 'huge' } })).toBe(false)
    expect(instant('diaper', { contents: 'dirty', poop: { ...poop, color: 'blue' } })).toBe(false)
    expect(instant('diaper', { contents: 'dirty', poop: { ...poop, curds: true } })).toBe(true)
    expect(instant('diaper', { contents: 'dirty', poop: { ...poop, curds: 'yes' } })).toBe(false)
  })

  it('rejects data that does not match the type', () => {
    expect(eventSchema.safeParse({ ...sleep(null), data: { contents: 'wet' } }).success).toBe(false)
  })

  it('rejects an end before the start', () => {
    expect(eventSchema.safeParse(sleep(T0 - MINUTE)).success).toBe(false)
  })

  it('lets bottles, solids and pumping run or end, and only those with a duration', () => {
    const bottle = finished('feeding', { kind: 'bottle', amountMl: 90, milk: 'breast' })
    expect(eventSchema.safeParse(bottle).success).toBe(true)
    expect(
      eventSchema.safeParse(finished('feeding', { kind: 'solids', food: '米粉' })).success,
    ).toBe(true)
    expect(eventSchema.safeParse(finished('diaper', { contents: 'wet' })).success).toBe(false)
    expect(eventDurationMs(eventSchema.parse(bottle), T0)).toBe(15 * MINUTE)
    const running = { ...bottle, endAt: null }
    expect(isRunning(eventSchema.parse(running))).toBe(true)
  })

  it('lets pumping run without an amount, but not end without one', () => {
    expect(instant('pumping', { side: 'both' })).toBe(true)
    expect(eventSchema.safeParse(finished('pumping', { side: 'both' })).success).toBe(false)
    expect(eventSchema.safeParse(finished('pumping', { side: 'left', amountMl: 60 })).success).toBe(
      true,
    )
  })

  describe('breast segments', () => {
    it('accepts contiguous segments that match the event', () => {
      const event = breast(
        [
          { side: 'left', startAt: T0, endAt: T0 + 10 * MINUTE },
          { side: 'right', startAt: T0 + 10 * MINUTE, endAt: T0 + 18 * MINUTE },
        ],
        T0 + 18 * MINUTE,
      )
      expect(eventSchema.safeParse(event).success).toBe(true)
    })

    it('accepts a running feed whose last segment is open', () => {
      const event = breast([{ side: 'left', startAt: T0, endAt: null }], null)
      expect(eventSchema.safeParse(event).success).toBe(true)
    })

    it('rejects gaps, open middle segments and mismatched ends', () => {
      const gap = breast(
        [
          { side: 'left', startAt: T0, endAt: T0 + MINUTE },
          { side: 'right', startAt: T0 + 2 * MINUTE, endAt: T0 + 3 * MINUTE },
        ],
        T0 + 3 * MINUTE,
      )
      const openMiddle = breast(
        [
          { side: 'left', startAt: T0, endAt: null },
          { side: 'right', startAt: T0 + MINUTE, endAt: T0 + 2 * MINUTE },
        ],
        T0 + 2 * MINUTE,
      )
      const stillOpen = breast([{ side: 'left', startAt: T0, endAt: null }], T0 + MINUTE)
      for (const event of [gap, openMiddle, stillOpen]) {
        expect(eventSchema.safeParse(event).success).toBe(false)
      }
    })
  })
})

describe('event helpers', () => {
  const runningSleep = eventSchema.parse(sleep(null))
  const finishedSleep = eventSchema.parse(sleep(T0 + 45 * MINUTE))
  const diaper = eventSchema.parse({
    ...baseEvent(),
    type: 'diaper',
    startAt: T0,
    endAt: null,
    data: { contents: 'dirty' },
  })

  it('knows which events are timed and running', () => {
    expect(hasDuration(runningSleep)).toBe(true)
    expect(hasDuration(diaper)).toBe(false)
    expect(hasKnownDuration(finishedSleep)).toBe(true)
    expect(hasKnownDuration(runningSleep)).toBe(false)
    expect(isRunning(runningSleep)).toBe(true)
    expect(isRunning(finishedSleep)).toBe(false)
    expect(isRunning(diaper)).toBe(false)
  })

  it('derives durations from timestamps', () => {
    expect(eventDurationMs(finishedSleep, T0 + 99 * MINUTE)).toBe(45 * MINUTE)
    expect(eventDurationMs(runningSleep, T0 + 5 * MINUTE)).toBe(5 * MINUTE)
    expect(eventDurationMs(diaper, T0 + 5 * MINUTE)).toBe(0)
  })

  it('totals breastfeeding time per side, including the running segment', () => {
    const totals = breastSideDurations(
      [
        { side: 'left', startAt: T0, endAt: T0 + 10 * MINUTE },
        { side: 'right', startAt: T0 + 10 * MINUTE, endAt: T0 + 15 * MINUTE },
        { side: 'left', startAt: T0 + 15 * MINUTE, endAt: null },
      ],
      T0 + 20 * MINUTE,
    )
    expect(totals).toEqual({ left: 15 * MINUTE, right: 5 * MINUTE })
  })

  it('lists every record type in the schema, in its order', () => {
    expect(EVENT_TYPES).toEqual(eventSchema.options.map((option) => option.shape.type.value))
  })
})
