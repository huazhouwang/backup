import { type AgeNorms, ageNorms } from './age-norms'
import { DAY, MINUTE } from './date'
import type { Event, FeedingEvent } from './event'
import { RECORD_KINDS } from './record-kinds'

/** A suggested time, give or take: never a target, babies vary. */
export interface Window {
  from: number
  to: number
  /** Whether the baby's own recent records shaped it, not only their age. */
  personalized: boolean
}

export type NextFeed =
  | { status: 'feeding' }
  | { status: 'unknown' }
  | ({ status: 'predicted'; since: number } & Window)

export type NextSleep =
  | {
      status: 'sleeping'
      since: number
      /** Roughly when the baby wakes, or null once the sleep runs far past it. */
      wake: Window | null
    }
  | { status: 'unknown' }
  | ({
      status: 'predicted'
      /** When the baby last woke up. */
      since: number
      /** How long this sleep likely lasts. */
      length: number
    } & Window)

export type NextDiaper = { status: 'unknown' } | ({ status: 'predicted'; since: number } & Window)

export type PlanItem =
  | { kind: 'feed'; at: number }
  | { kind: 'diaper'; at: number }
  | { kind: 'sleep'; at: number; length: number }
  /** Waking up, with what is done then: at night, a feed and a change before sleeping on. */
  | { kind: 'wake'; at: number; feed: boolean; diaper: boolean }

export interface NextUp {
  feed: NextFeed
  sleep: NextSleep
  diaper: NextDiaper
  /** Roughly how the next 12 hours go: sleeps and wakings, feeds and changes, in time order. */
  plan: PlanItem[]
  /** The baby's usual time from one meal, and one diaper change, to the next. */
  feedEvery: number
  diaperEvery: number
}

export interface NextUpOptions {
  /** Age in months, whole or fractional. */
  months: number
  now: number
  /** Minutes since local midnight at an instant; the device's clock unless given. */
  minuteOfDay?: (at: number) => number
}

/** Rhythms are read from this far back, the latest days counting the most. */
const HISTORY = 7 * DAY
/** Each day further back counts half as much. */
const HALF_LIFE = DAY
/** Samples from this close in time of day count (minutes), the closer the more. */
const CLOCK_REACH = 120
/** Fewer samples than this and the age's usual value is used. */
const MIN_SAMPLES = 3
/** Awake less than this between two sleeps (a stir, a transfer) and they are one sleep. */
const STIR = 15 * MINUTE
const HORIZON = 12 * 60 * MINUTE
/** A suggestion stays this long past its window, then goes: by then it is late or unlogged. */
const LATE = 60 * MINUTE
/**
 * Night, for what is assumed until the baby's own nights are known: a sleep that starts in it
 * is a long stretch, and waking in it is brief, to feed and sleep on.
 */
const NIGHT_FROM = 19 * 60
const NIGHT_UNTIL = 5 * 60
/** Awake at night, in minutes: a feed and a change, then back to sleep. */
const NIGHT_AWAKE: readonly [number, number] = [30, 60]
/** Due within this long of waking, a feed or change is done on waking. */
const ON_WAKING = 30 * MINUTE
/** Babies under this many months still feed when they wake at night. */
const NIGHT_FEEDS_UNTIL = 12
const PLAN_LIMIT = 16
const MINUTES_A_DAY = 24 * 60
/** Formula leaves the stomach about half as fast as breast milk; it counts for more. */
const FORMULA_WEIGHT = 1.5
/** Milk a minute at the breast, roughly (about 125 ml over 20 minutes). */
const BREAST_ML_A_MINUTE = 6
/**
 * How much a meal's size moves the next one: a little. Feed size goes with the interval
 * before a feed more than the one after it.
 */
const SIZE_EFFECT = 0.3

const deviceMinute = (at: number) => {
  const date = new Date(at)
  return date.getHours() * 60 + date.getMinutes()
}

type Range = readonly [number, number]
const minutes = ([min, max]: Range): Range => [min * MINUTE, max * MINUTE]

interface Sample {
  value: number
  /** The instant whose time of day the sample belongs to. */
  at: number
}

/** The value where half the weight lies on each side. */
function weightedMedian(samples: readonly { value: number; weight: number }[]): number | null {
  const sorted = samples.toSorted((a, b) => a.value - b.value)
  const half = sorted.reduce((sum, sample) => sum + sample.weight, 0) / 2
  let sum = 0
  for (const sample of sorted) {
    sum += sample.weight
    if (sum >= half) return sample.value
  }
  return null
}

const mid = ({ from, to }: Window) => (from + to) / 2

/** Rounds to the nearest 5 minutes, so suggestions read as plain clock times. */
const round = (time: number) => Math.round(time / (5 * MINUTE)) * 5 * MINUTE

/** The usual value over the last week; with a `clock`, only from around its time of day. */
function usual(
  samples: readonly Sample[],
  now: number,
  clock?: { at: number; minuteOfDay: (at: number) => number },
): number | null {
  const near = samples.flatMap((sample) => {
    if (sample.at < now - HISTORY) return []
    let weight = 0.5 ** ((now - sample.at) / HALF_LIFE)
    if (clock) {
      const apart = Math.abs(clock.minuteOfDay(sample.at) - clock.minuteOfDay(clock.at))
      const distance = Math.min(apart, MINUTES_A_DAY - apart)
      if (distance >= CLOCK_REACH) return []
      weight *= 1 - distance / CLOCK_REACH
    }
    return [{ value: sample.value, weight }]
  })
  return near.length >= MIN_SAMPLES ? weightedMedian(near) : null
}

interface Rhythm {
  /** The usual interval. */
  center: number
  /** Give or take. */
  spread: number
  personalized: boolean
}

/** The usual interval around `at`'s time of day: the baby's own once there are enough. */
function rhythmAt(
  samples: readonly Sample[],
  [min, max]: Range,
  at: number,
  now: number,
  minuteOfDay: (at: number) => number,
): Rhythm {
  const own = usual(samples, now, { at, minuteOfDay })
  // The baby's own, kept within reach of the age's (nights run longer than days).
  const center = own === null ? (min + max) / 2 : Math.min(Math.max(own, min * 0.5), max * 2)
  const spread = Math.max(15 * MINUTE, (max - min) / 4)
  return { center, spread, personalized: own !== null }
}

const window = (start: number, center: number, rhythm: Rhythm): Window => ({
  from: round(start + center - rhythm.spread),
  to: round(start + center + rhythm.spread),
  personalized: rhythm.personalized,
})

/** Gaps from one start to the next, each at the first's time of day. */
function startGaps(starts: readonly number[], cap: number): Sample[] {
  const gaps: Sample[] = []
  for (let i = 1; i < starts.length; i++) {
    const before = starts[i - 1] ?? 0
    const gap = (starts[i] ?? 0) - before
    if (gap > 0 && gap <= cap) gaps.push({ value: gap, at: before })
  }
  return gaps
}

/** A sleep, with any that followed after only a stir. */
interface Sleep {
  startAt: number
  /** Null while it runs. */
  endAt: number | null
}

function sleepsOf(events: readonly Event[]): Sleep[] {
  const joined: Sleep[] = []
  for (const event of events) {
    if (event.type !== 'sleep') continue
    const last = joined.at(-1)
    if (last && (last.endAt === null || event.startAt - last.endAt < STIR)) {
      last.endAt =
        last.endAt === null || event.endAt === null ? null : Math.max(last.endAt, event.endAt)
    } else {
      joined.push({ startAt: event.startAt, endAt: event.endAt })
    }
  }
  return joined
}

/** How much a feed fills the stomach, in ml of breast milk; formula counts for more. */
function fill(event: FeedingEvent, norms: AgeNorms): number {
  const typical = (norms.bottleMlPerFeed[0] + norms.bottleMlPerFeed[1]) / 2
  const { data } = event
  if (data.kind === 'bottle') {
    if (data.breastMl !== undefined && data.formulaMl !== undefined) {
      return data.breastMl + data.formulaMl * FORMULA_WEIGHT
    }
    const weight = { breast: 1, formula: FORMULA_WEIGHT, mixed: (1 + FORMULA_WEIGHT) / 2 }
    return data.amountMl * weight[data.milk]
  }
  if (data.kind === 'breast') {
    const fed = (event.endAt ?? event.startAt) - event.startAt
    return fed > 0 ? (fed / MINUTE) * BREAST_ML_A_MINUTE : typical
  }
  return typical
}

/** One meal: a feed and any that followed while most of it was still in the stomach. */
interface Meal {
  startAt: number
  /** Null while a feed in it runs. */
  endAt: number | null
  fill: number
}

/**
 * Feeds as meals. The stomach is a bucket that fills with each feed and drains at the
 * baby's own pace (their milk a day, or the age's); a feed that starts while it is still at
 * least half full tops up the meal before it rather than starting a new one.
 */
function mealsOf(events: readonly Event[], norms: AgeNorms, now: number): Meal[] {
  const feeds = events.filter((event): event is FeedingEvent => event.type === 'feeding')
  const recent = feeds.filter((feed) => feed.startAt >= now - HISTORY)
  const span = now - (recent[0]?.startAt ?? now)
  const ageDrain = (norms.milkMlPerDay[0] + norms.milkMlPerDay[1]) / 2 / DAY
  const drain =
    span >= 2 * DAY ? recent.reduce((sum, feed) => sum + fill(feed, norms), 0) / span : ageDrain

  const meals: Meal[] = []
  for (const feed of feeds) {
    const amount = fill(feed, norms)
    const meal = meals.at(-1)
    const left = meal && meal.endAt !== null ? meal.fill - drain * (feed.startAt - meal.endAt) : 0
    if (meal && (meal.endAt === null || left >= meal.fill / 2)) {
      meal.fill += amount
      meal.endAt =
        meal.endAt === null || feed.endAt === null ? null : Math.max(meal.endAt, feed.endAt)
    } else {
      meals.push({ startAt: feed.startAt, endAt: feed.endAt, fill: amount })
    }
  }
  return meals
}

/**
 * What comes next for a baby, from their age and their own last week.
 *
 * Sleep is just sleep: the baby is awake a while, then asleep a while, and how long each
 * lasts depends on the time of day (sleep pressure builds while awake; the body clock makes
 * the night's sleep long). Both are read from the baby's own days around the same time.
 *
 * Feeds fill the stomach like a bucket that drains at the baby's pace, so a top-up joins the
 * meal before it. The next meal comes after the baby's usual interval at that time of day,
 * nudged a little by how big the meal was.
 */
export function nextUp(events: readonly Event[], options: NextUpOptions): NextUp {
  const { months, now, minuteOfDay = deviceMinute } = options
  const norms = ageNorms(months)
  const live = events
    .filter((event) => event.deletedAt === null && event.startAt <= now)
    .toSorted((a, b) => a.startAt - b.startAt)

  /** Still worth showing: not yet an hour past its window. */
  const due = ({ to }: Window) => now <= to + LATE

  // Sleep: awake spells and sleeps, each by the time of day it starts.
  const sleeps = sleepsOf(live)
  const wakeRange = minutes(norms.wakeMinutes)
  const awakeSpells: Sample[] = []
  const sleepLengths: Sample[] = []
  for (const [i, sleep] of sleeps.entries()) {
    if (sleep.endAt === null) continue
    sleepLengths.push({ value: sleep.endAt - sleep.startAt, at: sleep.startAt })
    const after = sleeps[i + 1]
    const awake = after ? after.startAt - sleep.endAt : 0
    if (awake > 0 && awake <= wakeRange[1] * 3) awakeSpells.push({ value: awake, at: sleep.endAt })
  }
  const isNight = (at: number) => {
    const minute = minuteOfDay(at)
    return minute >= NIGHT_FROM || minute < NIGHT_UNTIL
  }
  const awakeAt = (wokeAt: number) =>
    rhythmAt(
      awakeSpells,
      isNight(wokeAt) ? minutes(NIGHT_AWAKE) : wakeRange,
      wokeAt,
      now,
      minuteOfDay,
    )
  const ownLength = (startAt: number) => usual(sleepLengths, now, { at: startAt, minuteOfDay })
  const nightStretch = minutes(norms.nightSleepMinutes)
  const lengthAt = (startAt: number) =>
    ownLength(startAt) ??
    (isNight(startAt)
      ? (nightStretch[0] + nightStretch[1]) / 2
      : RECORD_KINDS.sleep.usualMinutes * MINUTE)

  const lastSleep = sleeps.at(-1)
  let sleep: NextSleep = { status: 'unknown' }
  if (lastSleep?.endAt === null) {
    const length = lengthAt(lastSleep.startAt)
    const spread = Math.max(15 * MINUTE, length / 6)
    const wakeAt = lastSleep.startAt + length
    const wake = {
      from: round(wakeAt - spread),
      to: round(wakeAt + spread),
      personalized: ownLength(lastSleep.startAt) !== null,
    }
    sleep = { status: 'sleeping', since: lastSleep.startAt, wake: due(wake) ? wake : null }
  } else if (lastSleep?.endAt) {
    const rhythm = awakeAt(lastSleep.endAt)
    const next = window(lastSleep.endAt, rhythm.center, rhythm)
    if (due(next)) {
      sleep = {
        status: 'predicted',
        since: lastSleep.endAt,
        length: lengthAt(lastSleep.endAt + rhythm.center),
        ...next,
      }
    }
  }

  // Feeds: meals, and the time from one meal's start to the next by time of day.
  const feedRange = minutes(norms.feedIntervalMinutes)
  const meals = mealsOf(live, norms, now)
  const mealGaps = startGaps(
    meals.map((meal) => meal.startAt),
    12 * 60 * MINUTE,
  )
  const feedAt = (at: number) => rhythmAt(mealGaps, feedRange, at, now, minuteOfDay)
  const usualFill = usual(
    meals.map((meal) => ({ value: meal.fill, at: meal.startAt })),
    now,
  )
  const lastMeal = meals.at(-1)
  let feed: NextFeed = { status: 'unknown' }
  if (lastMeal?.endAt === null) feed = { status: 'feeding' }
  else if (lastMeal) {
    const rhythm = feedAt(lastMeal.startAt)
    const size =
      usualFill === null
        ? 1
        : Math.min(Math.max((lastMeal.fill / usualFill) ** SIZE_EFFECT, 0.85), 1.15)
    const next = window(lastMeal.startAt, rhythm.center * size, rhythm)
    if (due(next)) feed = { status: 'predicted', since: lastMeal.startAt, ...next }
  }

  // Diapers: the usual interval by time of day.
  const diaperRange = minutes(norms.diaperIntervalMinutes)
  const changes = live.filter((event) => event.type === 'diaper').map((event) => event.startAt)
  const diaperGaps = startGaps(changes, diaperRange[1] * 3)
  const lastChange = changes.at(-1)
  let diaper: NextDiaper = { status: 'unknown' }
  if (lastChange !== undefined) {
    const rhythm = rhythmAt(diaperGaps, diaperRange, lastChange, now, minuteOfDay)
    const next = window(lastChange, rhythm.center, rhythm)
    if (due(next)) diaper = { status: 'predicted', since: lastChange, ...next }
  }

  // The next 12 hours: asleep and awake in turn. Feeds and changes come at their rhythm while
  // awake; one due while asleep is done on waking, and at night every waking has them. One
  // already late is due now.
  const plan: PlanItem[] = []
  const end = now + HORIZON
  const add = (item: PlanItem) => {
    if (item.at >= now && item.at < end) plan.push({ ...item, at: round(item.at) })
  }
  const diaperAt = (at: number) => rhythmAt(diaperGaps, diaperRange, at, now, minuteOfDay)
  let nextFeed =
    feed.status === 'predicted'
      ? mid(feed)
      : feed.status === 'feeding' && lastMeal
        ? lastMeal.startAt + feedAt(lastMeal.startAt).center
        : lastMeal
          ? now
          : null
  let nextDiaper =
    diaper.status === 'predicted' ? mid(diaper) : lastChange === undefined ? null : now
  let wakeAt = sleep.status === 'sleeping' && sleep.wake ? mid(sleep.wake) : null
  let nextSleep = sleep.status === 'predicted' ? mid(sleep) : null
  while (plan.length < PLAN_LIMIT) {
    if (wakeAt !== null) {
      const night = isNight(wakeAt)
      const feeds =
        (night && months < NIGHT_FEEDS_UNTIL) ||
        (nextFeed !== null && nextFeed <= wakeAt + ON_WAKING)
      const changed = nextDiaper !== null && (nextDiaper <= wakeAt + ON_WAKING || night)
      add({ kind: 'wake', at: wakeAt, feed: feeds, diaper: changed })
      if (feeds) nextFeed = wakeAt + feedAt(wakeAt).center
      if (changed) nextDiaper = wakeAt + diaperAt(wakeAt).center
      nextSleep = wakeAt + awakeAt(wakeAt).center
      wakeAt = null
      continue
    }
    const first = Math.min(nextFeed ?? Infinity, nextDiaper ?? Infinity, nextSleep ?? Infinity)
    if (first >= end) break
    if (first === nextFeed) {
      add({ kind: 'feed', at: first })
      nextFeed = first + feedAt(first).center
    } else if (first === nextDiaper) {
      // Not woken for a change at night.
      if (!isNight(first)) add({ kind: 'diaper', at: first })
      nextDiaper = first + diaperAt(first).center
    } else {
      const length = lengthAt(first)
      add({ kind: 'sleep', at: first, length })
      wakeAt = first + length
      nextSleep = null
    }
  }

  return {
    feed,
    sleep,
    diaper,
    plan,
    feedEvery: usual(mealGaps, now) ?? (feedRange[0] + feedRange[1]) / 2,
    diaperEvery: usual(diaperGaps, now) ?? (diaperRange[0] + diaperRange[1]) / 2,
  }
}
