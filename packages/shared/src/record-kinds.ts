import type { Event } from './event'

/**
 * What a record is, one level finer than its type: feeds differ by kind (breast, bottle,
 * solids) in how they are timed and logged.
 */
export type RecordKind =
  | 'breast'
  | 'bottle'
  | 'solids'
  | 'sleep'
  | 'pumping'
  | 'diaper'
  | 'temperature'
  | 'medication'
  | 'growth'
  | 'note'
  | 'vaccination'

export type Side = 'left' | 'right' | 'both'

export interface RecordKindDefinition {
  /**
   * Instant records happen at one time. Duration records can run as a timer (no end yet) or
   * be logged afterwards with a start and how long they took.
   */
  timing: 'instant' | 'duration'
  /** Quick choices for how long it took, in minutes, when logging afterwards. */
  durations: readonly number[]
  /** The choice picked to begin with: a typical length. */
  usualMinutes: number
  /** Sides it can be on; the first is the default. */
  sides: readonly Side[]
}

const instant: RecordKindDefinition = {
  timing: 'instant',
  durations: [],
  usualMinutes: 0,
  sides: [],
}

/** Every kind of record and how it is timed: the one place to look this up. */
export const RECORD_KINDS: Record<RecordKind, RecordKindDefinition> = {
  breast: {
    timing: 'duration',
    durations: [5, 10, 15, 20, 30],
    usualMinutes: 10,
    sides: ['left', 'right'],
  },
  bottle: { timing: 'duration', durations: [5, 10, 15, 20, 30], usualMinutes: 15, sides: [] },
  solids: { timing: 'duration', durations: [10, 15, 20, 30, 45], usualMinutes: 20, sides: [] },
  sleep: {
    timing: 'duration',
    durations: [30, 60, 90, 120, 180],
    usualMinutes: 60,
    sides: [],
  },
  pumping: {
    timing: 'duration',
    durations: [10, 15, 20, 30, 45],
    usualMinutes: 15,
    sides: ['both', 'left', 'right'],
  },
  diaper: instant,
  temperature: instant,
  medication: instant,
  growth: instant,
  note: instant,
  vaccination: instant,
}

/**
 * The kinds timed as a duration, in RECORD_KINDS order: they run as a timer or are logged
 * with how long they took.
 */
export const DURATION_KINDS = [
  'breast',
  'bottle',
  'solids',
  'sleep',
  'pumping',
] as const satisfies readonly RecordKind[]
export type DurationKind = (typeof DURATION_KINDS)[number]

export function recordKind(event: Pick<Event, 'type' | 'data'>): RecordKind {
  if (event.type !== 'feeding') return event.type
  // A Pick of the union doesn't tie `data` to `type`; tell the feeds apart by their fields.
  const { data } = event
  return 'segments' in data ? 'breast' : 'food' in data ? 'solids' : 'bottle'
}

export const recordKindOf = (event: Pick<Event, 'type' | 'data'>): RecordKindDefinition =>
  RECORD_KINDS[recordKind(event)]

const deviceMinute = (at: number) => {
  const date = new Date(at)
  return date.getHours() * 60 + date.getMinutes()
}

/**
 * Night sleep starts between 19:00 and 06:59 local time; anything else is a nap. Only a
 * label for people: predictions read sleep as sleep.
 */
export function sleepKindFor(
  startAt: number,
  minuteOfDay: (at: number) => number = deviceMinute,
): 'nap' | 'night' {
  const hour = Math.floor(minuteOfDay(startAt) / 60)
  return hour >= 19 || hour < 7 ? 'night' : 'nap'
}
