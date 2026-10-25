/**
 * What is usual for a baby of a given age: the one table behind the suggestions on Today, the
 * reminders' starting intervals, and the assistant's checks for misheard values. Ranges are
 * deliberately wide: they describe healthy babies in general, not targets. Sources:
 * - AAP, HealthyChildren.org, "Amount and Schedule of Baby Formula Feedings" (bottle amounts,
 *   how often, about 960 ml a day at most) and "How Often and How Much Should Your Baby Eat?".
 * - 中国营养学会《中国居民膳食指南（2022）》婴幼儿喂养指南 (milk a day from 7 months, solids
 *   from 6 months).
 * - WHO infant and young child feeding (solids from about 6 months, 8–12 breastfeeds a day for
 *   newborns).
 * - AASM 2016 consensus and National Sleep Foundation (sleep a day by age); common pediatric
 *   sleep guidance for wake windows and for how long a night stretch of sleep lasts by age.
 */
export interface AgeNorms {
  /** Up to this many whole months (exclusive). */
  untilMonths: number
  /** Awake between two sleeps, in minutes. */
  wakeMinutes: [number, number]
  /** From the start of one daytime feed to the start of the next, in minutes. */
  feedIntervalMinutes: [number, number]
  /** Between daytime diaper changes, in minutes. */
  diaperIntervalMinutes: [number, number]
  /** One stretch of sleep at night, in minutes, until the baby's own nights are known. */
  nightSleepMinutes: [number, number]
  bottleMlPerFeed: [number, number]
  feedsPerDay: [number, number]
  /** Milk a day, bottle and breast together, when it is known. */
  milkMlPerDay: [number, number]
  sleepHoursPerDay: [number, number]
  /** Whether solids are usual yet. */
  solids: 'no' | 'starting' | 'yes'
}

type Intake = Pick<
  AgeNorms,
  'bottleMlPerFeed' | 'feedsPerDay' | 'milkMlPerDay' | 'sleepHoursPerDay' | 'solids'
>

const NEWBORN: Intake = {
  bottleMlPerFeed: [30, 120],
  feedsPerDay: [8, 12],
  milkMlPerDay: [300, 750],
  sleepHoursPerDay: [14, 17],
  solids: 'no',
}
const ONE_MONTH: Intake = {
  bottleMlPerFeed: [90, 150],
  feedsPerDay: [6, 10],
  milkMlPerDay: [500, 900],
  sleepHoursPerDay: [14, 17],
  solids: 'no',
}
const TWO_MONTHS: Intake = {
  bottleMlPerFeed: [120, 180],
  feedsPerDay: [6, 8],
  milkMlPerDay: [600, 960],
  sleepHoursPerDay: [14, 17],
  solids: 'no',
}
const FOUR_MONTHS: Intake = {
  bottleMlPerFeed: [120, 210],
  feedsPerDay: [5, 7],
  milkMlPerDay: [700, 960],
  sleepHoursPerDay: [12, 16],
  solids: 'starting',
}
const SIX_MONTHS: Intake = {
  bottleMlPerFeed: [150, 240],
  feedsPerDay: [4, 6],
  milkMlPerDay: [600, 900],
  sleepHoursPerDay: [12, 16],
  solids: 'yes',
}
const NINE_MONTHS: Intake = {
  bottleMlPerFeed: [150, 240],
  feedsPerDay: [3, 5],
  milkMlPerDay: [600, 800],
  sleepHoursPerDay: [12, 16],
  solids: 'yes',
}
const TODDLER: Intake = {
  bottleMlPerFeed: [120, 240],
  feedsPerDay: [2, 4],
  milkMlPerDay: [400, 600],
  sleepHoursPerDay: [11, 14],
  solids: 'yes',
}

const band = (
  untilMonths: number,
  wakeMinutes: [number, number],
  feedIntervalMinutes: [number, number],
  diaperIntervalMinutes: [number, number],
  nightSleepMinutes: [number, number],
  intake: Intake,
): AgeNorms => ({
  untilMonths,
  wakeMinutes,
  feedIntervalMinutes,
  diaperIntervalMinutes,
  nightSleepMinutes,
  ...intake,
})

/**
 * By age: until months, awake, feed every, diaper every, a night's stretch of sleep, then what
 * the baby takes in.
 */
export const AGE_NORMS: readonly AgeNorms[] = [
  band(1, [35, 60], [120, 180], [120, 180], [120, 180], NEWBORN),
  band(2, [60, 90], [150, 210], [150, 210], [180, 300], ONE_MONTH),
  band(3, [60, 90], [150, 240], [150, 210], [180, 300], TWO_MONTHS),
  band(4, [75, 120], [180, 240], [180, 240], [300, 360], TWO_MONTHS),
  band(5, [90, 150], [180, 240], [180, 240], [300, 360], FOUR_MONTHS),
  band(6, [120, 180], [180, 270], [180, 240], [300, 360], FOUR_MONTHS),
  band(7, [120, 180], [180, 270], [180, 240], [360, 480], SIX_MONTHS),
  band(9, [150, 210], [210, 270], [180, 240], [360, 480], SIX_MONTHS),
  band(11, [165, 240], [210, 300], [180, 270], [360, 480], NINE_MONTHS),
  band(12, [180, 270], [210, 300], [180, 270], [360, 480], NINE_MONTHS),
  band(13, [180, 270], [180, 240], [180, 270], [600, 660], TODDLER),
  band(19, [240, 330], [180, 240], [180, 270], [600, 660], TODDLER),
  band(Number.POSITIVE_INFINITY, [300, 360], [180, 240], [180, 270], [600, 660], TODDLER),
]

/** What is usual at `months` old (whole or fractional). */
export function ageNorms(months: number): AgeNorms {
  return AGE_NORMS.find((norms) => months < norms.untilMonths) ?? AGE_NORMS.at(-1)!
}
