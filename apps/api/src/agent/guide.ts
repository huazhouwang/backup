import {
  type BabyAge,
  DAY,
  type Event,
  MINUTE,
  type PlanItem,
  type Window,
  ageNorms,
  babyAge,
  nextUp,
} from '@bobo/shared'

import { type VoiceBaby, durationLabel, formatClock, localDay, minuteOfDayIn } from '../voice/plan'
import { recentEvents } from './data'

// What is usual at each age (ageNorms) lets the assistant tell a misheard value ("十五毫升"
// for "五十毫升") from a real one.

/**
 * Past these, a value is taken as misheard until the parent confirms it: well beyond what
 * any baby of the age does, so a real one is rare and worth one question.
 */
export function hardLimits(months: number) {
  const reference = ageNorms(months)
  return {
    bottleMl: Math.round(reference.bottleMlPerFeed[1] * 1.5),
    pumpingMl: 400,
    breastMinutes: 90,
    sleepHours: months < 3 ? 8 : 14,
    celsius: [35, 41.5] as const,
    /** Solids this early are almost always a mishearing. */
    solidsFromMonths: 4,
  }
}

export function ageLabel(age: BabyAge): string {
  if (age.months === 0) return `出生 ${age.days} 天`
  if (age.months < 24) return `${age.months} 个月${age.days ? ` ${age.days} 天` : ''}`
  const years = Math.floor(age.months / 12)
  const months = age.months % 12
  return `${years} 岁${months ? ` ${months} 个月` : ''}`
}

const range = ([low, high]: [number, number], unit: string) => `${low}–${high} ${unit}`

/** The age's usual values, as one line of the instructions. */
export function referenceLine(months: number): string {
  const reference = ageNorms(months)
  const solids = { no: '还不吃辅食', starting: '可以开始添加辅食', yes: '吃辅食' }[reference.solids]
  return [
    `瓶喂每次 ${range(reference.bottleMlPerFeed, '毫升')}`,
    `一天喂 ${range(reference.feedsPerDay, '次')}`,
    `一天奶量 ${range(reference.milkMlPerDay, '毫升')}`,
    `一天睡 ${range(reference.sleepHoursPerDay, '小时')}`,
    solids,
  ].join('，')
}

const median = (values: number[]) => {
  const sorted = values.toSorted((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

/** The baby's own recent habits from the last days' records, or null without enough of them. */
export function habitsLine(events: Event[], days: number): string | null {
  const bottles = events.flatMap((event) =>
    event.type === 'feeding' && event.data.kind === 'bottle' ? [event.data.amountMl] : [],
  )
  const feeds = events.filter((event) => event.type === 'feeding' && event.data.kind !== 'solids')
  const parts: string[] = []
  if (bottles.length >= 3) {
    const sorted = bottles.toSorted((a, b) => a - b)
    parts.push(`瓶喂通常 ${median(bottles)} 毫升（${sorted[0]}–${sorted.at(-1)}）`)
  }
  if (feeds.length >= days) {
    parts.push(`一天约喂 ${Math.round(feeds.length / days)} 次`)
  }
  return parts.length > 0 ? parts.join('，') : null
}

/** Age of a baby today in the family's zone. */
export function ageOn(birthDate: string, now: number, timeZone: string): BabyAge {
  return babyAge(birthDate, localDay(now, timeZone))
}

/**
 * Why a change looks misheard for this baby, or null when it is plausible. Only clear cases:
 * the assistant judges the rest itself from the references in its instructions.
 */
export function implausible(
  event: Event,
  before: Event | null,
  birthDate: string,
  now: number,
  timeZone: string,
): string | null {
  const age = ageOn(birthDate, now, timeZone)
  const limits = hardLimits(age.months)
  const reference = ageNorms(age.months)
  const at = ageLabel(age)
  if (event.startAt > now + 10 * MINUTE || (event.endAt ?? 0) > now + 10 * MINUTE) {
    return '时间在将来'
  }
  if (event.type === 'feeding' && event.data.kind === 'bottle') {
    if (event.data.amountMl > limits.bottleMl) {
      return `${at}的宝宝瓶喂 ${event.data.amountMl} 毫升，远超常见的每次 ${range(reference.bottleMlPerFeed, '毫升')}`
    }
  }
  if (
    event.type === 'feeding' &&
    event.data.kind === 'solids' &&
    age.months < limits.solidsFromMonths
  ) {
    return `${at}的宝宝通常还不吃辅食`
  }
  if (event.type === 'pumping' && (event.data.amountMl ?? 0) > limits.pumpingMl) {
    return `一次吸奶 ${event.data.amountMl} 毫升，远超常见的量`
  }
  if (event.type === 'temperature') {
    const [low, high] = limits.celsius
    if (event.data.celsius < low || event.data.celsius > high) {
      return `体温 ${event.data.celsius}°C 不太可能`
    }
  }
  // A timer just stopped ("醒了") may run long because nobody stopped it; only check
  // durations that were said.
  const stoppedTimer = before !== null && before.endAt === null
  if (event.endAt !== null && !stoppedTimer) {
    const minutes = (event.endAt - event.startAt) / MINUTE
    if (event.type === 'sleep' && minutes > limits.sleepHours * 60) {
      return `${at}的宝宝一次睡 ${Math.round(minutes / 60)} 小时，太长了`
    }
    if (
      event.type === 'feeding' &&
      event.data.kind === 'breast' &&
      minutes > limits.breastMinutes
    ) {
      return `一次亲喂 ${Math.round(minutes)} 分钟，太长了`
    }
  }
  return null
}

const HABIT_DAYS = 7

/**
 * One line per baby for the instructions: name, age, what is usual at that age, and the
 * baby's own last week, so the assistant can tell a misheard value from a real one.
 */
export async function describeBabies(
  db: D1Database,
  babies: VoiceBaby[],
  now: number,
  timeZone: string,
): Promise<string[]> {
  const recent = await recentEvents(
    db,
    babies.map((baby) => baby.id),
    now - HABIT_DAYS * DAY,
    'feeding',
    500,
  )
  return babies.map((baby) => {
    const age = ageOn(baby.birthDate, now, timeZone)
    const habits = habitsLine(
      recent.filter((event) => event.babyId === baby.id),
      HABIT_DAYS,
    )
    return [
      `${baby.name}：${ageLabel(age)}。`,
      `这个月龄通常：${referenceLine(age.months)}。`,
      habits ? `最近 ${HABIT_DAYS} 天：${habits}。` : '',
    ].join('')
  })
}

function planLine(item: PlanItem): string {
  if (item.kind === 'feed') return '喂奶'
  if (item.kind === 'diaper') return '换尿布'
  if (item.kind === 'sleep') return `睡觉（约 ${durationLabel(item.length)}）`
  const then = [item.feed ? '喂奶' : '', item.diaper ? '换尿布' : ''].filter(Boolean).join('、')
  return then ? `醒来${then}` : '醒来'
}

/**
 * What likely comes next for a baby, in a few short lines: from their age and last week's
 * feeds, sleeps and diapers (nextUp), for questions like "下次什么时候喂？".
 */
export function nextUpLines(
  events: readonly Event[],
  birthDate: string,
  now: number,
  timeZone: string,
): string[] {
  const age = ageOn(birthDate, now, timeZone)
  const next = nextUp(events, {
    months: age.totalDays / (365.25 / 12),
    now,
    minuteOfDay: minuteOfDayIn(timeZone),
  })
  const span = (window: Window) =>
    `大约 ${formatClock(window.from, timeZone)}–${formatClock(window.to, timeZone)}` +
    (window.personalized ? '' : '（按月龄估算）')
  const lines: string[] = []
  if (next.feed.status === 'feeding') lines.push('正在喂')
  else if (next.feed.status === 'predicted') lines.push(`下次喂奶${span(next.feed)}`)
  if (next.sleep.status === 'sleeping') {
    lines.push(next.sleep.wake ? `正在睡，${span(next.sleep.wake)}醒` : '正在睡')
  } else if (next.sleep.status === 'predicted') {
    lines.push(`下次睡觉${span(next.sleep)}，约睡 ${durationLabel(next.sleep.length)}`)
  }
  if (next.diaper.status === 'predicted') lines.push(`下次换尿布${span(next.diaper)}`)
  if (next.plan.length > 1) {
    const plan = next.plan.map((item) => `${formatClock(item.at, timeZone)} ${planLine(item)}`)
    lines.push(`接下来 12 小时：${plan.join('，')}`)
  }
  return lines
}
