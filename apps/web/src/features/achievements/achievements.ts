import { type Baby, type Event, babyAge, localDateString, shiftDay } from '@lullabo/shared'

export type BadgeGroup = 'records' | 'streak' | 'night' | 'firsts' | 'age' | 'family'

export interface Badge {
  id: string
  group: BadgeGroup
  earned: boolean
  /** Toward the goal, for badges that count something. */
  progress?: { current: number; target: number }
}

export interface Streak {
  /** Consecutive days with a record, up to today (or yesterday until today has one). */
  current: number
  best: number
  loggedToday: boolean
}

export function computeStreak(events: readonly Event[], now: number): Streak {
  const days = new Set(events.map((event) => localDateString(event.startAt)))
  const today = localDateString(now)
  const loggedToday = days.has(today)
  let current = 0
  for (
    let day = loggedToday ? today : shiftDay(today, -1);
    days.has(day);
    day = shiftDay(day, -1)
  ) {
    current += 1
  }
  let best = 0
  let run = 0
  let previous: string | undefined
  for (const day of [...days].toSorted()) {
    run = previous !== undefined && shiftDay(previous, 1) === day ? run + 1 : 1
    best = Math.max(best, run)
    previous = day
  }
  return { current, best, loggedToday }
}

const counted = (id: string, group: BadgeGroup, current: number, target: number): Badge => ({
  id,
  group,
  earned: current >= target,
  progress: { current: Math.min(current, target), target },
})

const once = (id: string, group: BadgeGroup, earned: boolean): Badge => ({ id, group, earned })

/** Records between midnight and 5am, the hardest ones to log. */
const isNight = (event: Event) => new Date(event.startAt).getHours() < 5

/**
 * Badges for one baby, all computed on the device from its records. Order is display order:
 * the next ones to earn in each group come right after the earned ones.
 */
export function computeBadges(baby: Baby, events: readonly Event[], now: number): Badge[] {
  const { best } = computeStreak(events, now)
  const age = babyAge(baby.birthDate, localDateString(now)).totalDays
  const authors = new Set(events.map((event) => event.createdBy).filter((id) => id !== null))
  const has = (predicate: (event: Event) => boolean) => events.some(predicate)
  return [
    counted('records-1', 'records', events.length, 1),
    counted('records-100', 'records', events.length, 100),
    counted('records-500', 'records', events.length, 500),
    counted('records-1000', 'records', events.length, 1000),
    counted('streak-3', 'streak', best, 3),
    counted('streak-7', 'streak', best, 7),
    counted('streak-30', 'streak', best, 30),
    counted('streak-100', 'streak', best, 100),
    counted('night-10', 'night', events.filter(isNight).length, 10),
    counted('night-100', 'night', events.filter(isNight).length, 100),
    once(
      'first-solids',
      'firsts',
      has((event) => event.type === 'feeding' && event.data.kind === 'solids'),
    ),
    once(
      'first-growth',
      'firsts',
      has((event) => event.type === 'growth'),
    ),
    once('age-30', 'age', age >= 30),
    once('age-100', 'age', age >= 100),
    once('age-182', 'age', age >= 182),
    once('age-365', 'age', age >= 365),
    counted('family-2', 'family', authors.size, 2),
  ]
}
