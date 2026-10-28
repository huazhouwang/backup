import { describe, expect, it } from 'vitest'

import { ageNorms } from './age-norms'
import { DAY, MINUTE } from './date'
import { type NextUpOptions, nextUp } from './next-up'
import { bottleEvent, diaperEvent, sleepEvent } from './testing'

// UTC stands in for the family's clock, so the times read as written.
const at = (day: number, hour: number, minute = 0) => Date.UTC(2026, 2, day, hour, minute)
const minuteOfDay = (time: number) => Math.floor((time % DAY) / MINUTE)
// Four months: awake 90–150 minutes, a feed every 180–240, a diaper every 180–240.
const options = (now: number): NextUpOptions => ({ months: 4.2, now, minuteOfDay })

const sleep = sleepEvent
const bottle = (start: number, minutes: number | null = 10, amountMl = 120) =>
  bottleEvent(start, { minutes, amountMl })
const diaper = (time: number) => diaperEvent(time)

describe('ageNorms', () => {
  it('grows with the baby', () => {
    expect(ageNorms(0).wakeMinutes).toEqual([35, 60])
    expect(ageNorms(4.2).wakeMinutes).toEqual([90, 150])
    expect(ageNorms(3).bottleMlPerFeed).toEqual([120, 180])
    expect(ageNorms(7).solids).toBe('yes')
    expect(ageNorms(30)).toMatchObject({ wakeMinutes: [300, 360], milkMlPerDay: [400, 600] })
  })
})

describe('nextUp', () => {
  it('knows nothing without records, and waits while a feed runs', () => {
    expect(nextUp([], options(at(1, 10)))).toMatchObject({
      feed: { status: 'unknown' },
      sleep: { status: 'unknown' },
      diaper: { status: 'unknown' },
    })
    expect(nextUp([bottle(at(1, 9, 50), null)], options(at(1, 10))).feed).toEqual({
      status: 'feeding',
    })
  })

  it('uses the age’s wake window without enough history', () => {
    const next = nextUp([sleep(at(1, 8), at(1, 9))], options(at(1, 9, 30)))
    // Centered on 2 hours, give or take 15 minutes; an hour's sleep until there are more.
    expect(next.sleep).toEqual({
      status: 'predicted',
      since: at(1, 9),
      length: 60 * MINUTE,
      from: at(1, 10, 45),
      to: at(1, 11, 15),
      personalized: false,
    })
  })

  it('keeps a late suggestion for an hour past its window, then lets it go', () => {
    // The age's window after 9:00: 10:45–11:15.
    const events = [sleep(at(1, 8), at(1, 9))]
    expect(nextUp(events, options(at(1, 12))).sleep).toMatchObject({ to: at(1, 11, 15) })
    expect(nextUp(events, options(at(1, 12, 20))).sleep).toEqual({ status: 'unknown' })
    // The plan keeps only what is still ahead.
    const late = nextUp([...events, bottle(at(1, 8))], options(at(1, 12)))
    expect(late.plan.every((item) => item.at >= at(1, 12))).toBe(true)
  })

  it('gives up when the last one is long past, probably not logged', () => {
    const next = nextUp([sleep(at(1, 8), at(1, 9)), bottle(at(1, 8))], options(at(1, 18)))
    expect(next.sleep).toEqual({ status: 'unknown' })
    expect(next.feed).toEqual({ status: 'unknown' })
  })

  describe('sleep, by the time of day', () => {
    // Three days: asleep 23:00–05:00, then 6:30–7:30, 9:30–10:30, 13:00–14:30, 17:00–18:00.
    // The nap/night label is left as "nap" throughout: it plays no part.
    const days = [1, 2, 3].flatMap((day) => [
      sleep(at(day - 1, 23), at(day, 5)),
      sleep(at(day, 6, 30), at(day, 7, 30)),
      sleep(at(day, 9, 30), at(day, 10, 30)),
      sleep(at(day, 13), at(day, 14, 30)),
      sleep(at(day, 17), at(day, 18)),
    ])

    it('after the night, suggests the morning sleep, not another night', () => {
      const events = [...days, sleep(at(3, 23), at(4, 5))]
      expect(nextUp(events, options(at(4, 5, 30))).sleep).toEqual({
        status: 'predicted',
        since: at(4, 5),
        length: 60 * MINUTE,
        from: at(4, 6, 15),
        to: at(4, 6, 45),
        personalized: true,
      })
    })

    it('in the evening, suggests the long sleep from the evenings before', () => {
      const events = [...days, sleep(at(3, 23), at(4, 5)), sleep(at(4, 17), at(4, 18))]
      expect(nextUp(events, options(at(4, 21)))).toMatchObject({
        sleep: { from: at(4, 22, 45), to: at(4, 23, 15), length: 6 * 60 * MINUTE },
      })
    })

    it('while asleep, says roughly when the baby wakes', () => {
      const events = [...days, sleep(at(3, 23), null)]
      expect(nextUp(events, options(at(4, 1))).sleep).toEqual({
        status: 'sleeping',
        since: at(3, 23),
        wake: { from: at(4, 4), to: at(4, 6), personalized: true },
      })
      // Hours past that, the timer was probably left running.
      expect(nextUp(events, options(at(4, 13))).sleep).toMatchObject({ wake: null })
    })

    it('lays out the next 12 hours: sleeps with how long, feeds between', () => {
      const events = [...days, sleep(at(3, 23), at(4, 5)), bottle(at(4, 5, 10))]
      const { plan } = nextUp(events, options(at(4, 5, 30)))
      expect(plan[0]).toEqual({ kind: 'sleep', at: at(4, 6, 30), length: 60 * MINUTE })
      expect(plan.map((item) => item.at)).toEqual(
        plan.map((item) => item.at).toSorted((a, b) => a - b),
      )
      expect(plan.some((item) => item.kind === 'feed')).toBe(true)
      expect(plan.at(-1)?.at).toBeLessThan(at(4, 17, 30))
    })

    it('counts a short stir as part of the sleep', () => {
      const events = [sleep(at(1, 8), at(1, 8, 40)), sleep(at(1, 8, 50), at(1, 9))]
      expect(nextUp(events, options(at(1, 9, 30))).sleep).toMatchObject({ since: at(1, 9) })
    })
  })

  describe('a night without history', () => {
    // Fed at 19:00, changed at 21:22, asleep since 22:15; no earlier nights logged.
    const events = [bottle(at(1, 19)), diaper(at(1, 21, 22)), sleep(at(1, 22, 15), null)]
    const next = nextUp(events, options(at(1, 22, 25)))

    it('expects a long stretch, not an hour as by day', () => {
      // Four months: a night stretch of 5–6 hours.
      expect(next.sleep).toMatchObject({
        status: 'sleeping',
        wake: { from: at(2, 2, 50), to: at(2, 4, 40), personalized: false },
      })
    })

    it('wakes to feed and change, then sleeps on, without feeds or naps in between', () => {
      const [wake, after] = next.plan
      expect(wake).toEqual({ kind: 'wake', at: at(2, 3, 45), feed: true, diaper: true })
      // Back to sleep after a short night waking, for another long stretch.
      expect(after).toMatchObject({ kind: 'sleep', at: at(2, 4, 30), length: 330 * MINUTE })
      expect(next.plan.filter((item) => item.at < at(2, 3, 45))).toEqual([])
    })

    it('feeds on waking at night even before any feed is logged', () => {
      const unfed = nextUp([sleep(at(1, 22, 15), null)], options(at(1, 22, 25)))
      expect(unfed.plan[0]).toMatchObject({ kind: 'wake', feed: true })
    })
  })

  describe('feeds', () => {
    it('counts a top-up as part of the meal before it', () => {
      // A little at 9:00, more at 9:30: one meal from 9:00, the next about 3.5 hours later.
      const events = [bottle(at(1, 9), 10, 40), bottle(at(1, 9, 30), 15, 100)]
      expect(nextUp(events, options(at(1, 10))).feed).toEqual({
        status: 'predicted',
        since: at(1, 9),
        from: at(1, 12, 15),
        to: at(1, 12, 45),
        personalized: false,
      })
    })

    it('follows the baby’s rhythm at that time of day, longer at night', () => {
      // Every 3 hours by day, then 23:00 to 4:00 at night, for four days.
      const days = [1, 2, 3, 4].flatMap((day) =>
        [4, 8, 11, 14, 17, 20, 23].map((hour) => bottle(at(day, hour))),
      )
      const morning = days.filter((event) => event.startAt <= at(4, 8))
      const day = nextUp(morning, options(at(4, 8, 30)))
      expect(day.feed).toMatchObject({ personalized: true, from: at(4, 10, 45), to: at(4, 11, 15) })
      expect(day.feedEvery).toBe(180 * MINUTE)
      const night = nextUp(days, options(at(5, 0, 30)))
      expect(night.feed).toMatchObject({ from: at(5, 3, 45), to: at(5, 4, 15) })
      // Another bottle within the hour tops up that meal rather than starting the clock again.
      const topUp = nextUp([...days, bottle(at(4, 23, 50), 10, 60)], options(at(5, 0, 30)))
      expect(topUp.feed).toMatchObject({ since: at(4, 23) })
    })
  })

  it('suggests diaper changes from the rhythm at that time of day', () => {
    const events = [1, 2, 3, 4].flatMap((day) =>
      [8, 11, 14, 17].map((hour) => diaper(at(day, hour))),
    )
    const today = events.filter((event) => event.startAt <= at(4, 14))
    expect(nextUp(today, options(at(4, 14, 30))).diaper).toMatchObject({
      personalized: true,
      from: at(4, 16, 45),
      to: at(4, 17, 15),
    })
  })
})
