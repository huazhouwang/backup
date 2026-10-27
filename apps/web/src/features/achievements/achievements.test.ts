import type { Baby } from '@lullabo/shared'
import { describe, expect, it } from 'vitest'

import { logDiaper, logSolids } from '../events/records'
import { computeBadges, computeStreak } from './achievements'

const BABY_ID = 'baby-1'
const at = (day: number, hour = 10) => new Date(2026, 9, day, hour).getTime()
const diaperOn = (day: number, hour = 10) => logDiaper(BABY_ID, at(day, hour), 'wet', at(day, hour))

const baby: Baby = {
  id: BABY_ID,
  familyId: null,
  name: '小米粒',
  birthDate: '2026-07-01',
  sex: 'unspecified',
  avatarColor: 'green',
  archivedAt: null,
  createdAt: 0,
  updatedAt: 0,
  deletedAt: null,
  createdBy: null,
}

describe('computeStreak', () => {
  it('counts consecutive days up to today', () => {
    const events = [diaperOn(10), diaperOn(11), diaperOn(12), diaperOn(12, 20), diaperOn(14)]
    expect(computeStreak(events, at(14, 22))).toEqual({ current: 1, best: 3, loggedToday: true })
  })

  it('keeps yesterday’s streak alive until today ends', () => {
    const events = [diaperOn(12), diaperOn(13)]
    expect(computeStreak(events, at(14, 9))).toEqual({ current: 2, best: 2, loggedToday: false })
    expect(computeStreak(events, at(15, 9))).toMatchObject({ current: 0, best: 2 })
  })

  it('is zero without records', () => {
    expect(computeStreak([], at(14))).toEqual({ current: 0, best: 0, loggedToday: false })
  })
})

describe('computeBadges', () => {
  it('earns badges from records and age', () => {
    const events = [
      diaperOn(12),
      diaperOn(13, 3),
      diaperOn(14),
      logSolids(BABY_ID, at(14), '米粉', at(14)),
    ]
    // Born 2026-07-01: 105 days old on 2026-10-14.
    const badges = computeBadges(baby, events, at(14, 22))
    const earned = badges.filter((badge) => badge.earned).map((badge) => badge.id)
    expect(earned).toEqual(['records-1', 'streak-3', 'first-solids', 'age-30', 'age-100'])
    expect(badges.find((badge) => badge.id === 'records-100')?.progress).toEqual({
      current: 4,
      target: 100,
    })
    expect(badges.find((badge) => badge.id === 'night-10')?.progress).toEqual({
      current: 1,
      target: 10,
    })
  })

  it('counts family members who logged', () => {
    const mine = { ...diaperOn(14), createdBy: 'parent' }
    const grandma = { ...diaperOn(14, 12), createdBy: 'grandma' }
    const family = computeBadges(baby, [mine, grandma], at(14)).find((b) => b.id === 'family-2')
    expect(family?.earned).toBe(true)
  })
})
