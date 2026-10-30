import {
  type Baby,
  type Event,
  HOUR,
  type PlannedDose,
  type PoopDetails,
  type VaccinationEvent,
  localDateString,
  vaccinePlan,
} from '@lullabo/shared'

import { summarizeDay } from '../events/summary'
import { ageInMonths, percentileOf } from '../growth/growth'
import { dayStarts } from '../trends/trends'

/** The periods a report can cover, in days ending today. */
export const REPORT_DAYS = [7, 14, 30] as const
export type ReportDays = (typeof REPORT_DAYS)[number]

export const isReportDays = (value: number): value is ReportDays =>
  REPORT_DAYS.some((days) => days === value)

/** A temperature this high (°C) or more is a fever. */
export const FEVER_CELSIUS = 38

export interface ReportDay {
  day: string
  feedings: number
  bottleMl: number
  breastMinutes: number
  sleepMs: number
  longestSleepMs: number
  naps: number
  wet: number
  /** Dirty diapers, mixed included. */
  dirty: number
  /** Anything logged that day. */
  logged: boolean
}

export interface Averages {
  feedings: number
  bottleMl: number
  breastMinutes: number
  sleepMs: number
  longestSleepMs: number
  naps: number
  wet: number
  dirty: number
  /** Start to start; null without two feeds close enough to tell. */
  feedIntervalMs: number | null
}

export interface GrowthReading {
  measure: 'weight' | 'length' | 'head'
  /** kg or cm. */
  value: number
  at: number
  percentile: number | undefined
  /** The reading before it, for the change. */
  previous: { value: number; at: number } | null
}

export interface DoctorReport {
  from: string
  to: string
  days: ReportDay[]
  /** Over the days anything was logged; null when none was. */
  averages: Averages | null
  loggedDays: number
  /** Poop worth a doctor's look: colours other than yellow, brown and green; watery ones. */
  poopFlags: { color: Record<string, number>; watery: number; curds: number }
  temperatures: { at: number; celsius: number }[]
  medications: { at: number; name: string; dose: string | null }[]
  notes: { at: number; text: string }[]
  growth: GrowthReading[]
  vaccinesGiven: VaccinationEvent[]
  /** Overdue doses, then those due within a month. */
  vaccinesNext: PlannedDose[]
}

/** Gaps longer than this are a pause in logging, not a feed interval. */
const MAX_GAP_MS = 12 * HOUR

const UNUSUAL_COLOURS: ReadonlySet<PoopDetails['color']> = new Set(['black', 'red', 'white'])

const mean = (values: readonly number[]) =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length

const FIELDS = { weight: 'weightKg', length: 'lengthCm', head: 'headCm' } as const

/**
 * What a doctor wants to see of the last `days` days: daily totals and their averages
 * (over the days something was logged, so a day off from logging doesn't halve them),
 * temperatures, medicines, notes, worrying poop, the latest growth with its WHO
 * percentile, and vaccinations given and coming.
 */
export function buildReport(
  baby: Baby,
  events: readonly Event[],
  days: ReportDays,
  now: number,
): DoctorReport {
  const live = events.filter((event) => event.deletedAt === null)
  const starts = dayStarts(days, now)
  const from = starts[0] ?? now
  const ends = starts.map((start, index) => starts[index + 1] ?? Number.POSITIVE_INFINITY)
  const inPeriod = (at: number) => at >= from && at <= now

  const rows: ReportDay[] = starts.map((start, index) => {
    const end = ends[index] ?? now
    const summary = summarizeDay(live, start, end, now)
    const logged = live.some((event) => event.startAt >= start && event.startAt < end)
    return {
      day: localDateString(start),
      feedings: summary.feedings,
      bottleMl: summary.bottleMl,
      breastMinutes: Math.round(summary.breastMs / 60_000),
      sleepMs: summary.sleepMs,
      longestSleepMs: summary.longestSleepMs,
      naps: summary.naps,
      wet: summary.diapers.wet + summary.diapers.mixed,
      dirty: summary.diapers.dirty + summary.diapers.mixed,
      logged,
    }
  })

  const loggedRows = rows.filter((row) => row.logged)
  const feeds = live
    .filter((event) => event.type === 'feeding' && inPeriod(event.startAt))
    .map((event) => event.startAt)
    .toSorted((a, b) => a - b)
  const gaps = feeds
    .slice(1)
    .map((at, index) => at - (feeds[index] ?? at))
    .filter((gap) => gap > 0 && gap <= MAX_GAP_MS)
  const averages: Averages | null =
    loggedRows.length === 0
      ? null
      : {
          feedings: mean(loggedRows.map((row) => row.feedings)),
          bottleMl: mean(loggedRows.map((row) => row.bottleMl)),
          breastMinutes: mean(loggedRows.map((row) => row.breastMinutes)),
          sleepMs: mean(loggedRows.map((row) => row.sleepMs)),
          longestSleepMs: mean(loggedRows.map((row) => row.longestSleepMs)),
          naps: mean(loggedRows.map((row) => row.naps)),
          wet: mean(loggedRows.map((row) => row.wet)),
          dirty: mean(loggedRows.map((row) => row.dirty)),
          feedIntervalMs: gaps.length === 0 ? null : mean(gaps),
        }

  const poopFlags: DoctorReport['poopFlags'] = { color: {}, watery: 0, curds: 0 }
  const temperatures: DoctorReport['temperatures'] = []
  const medications: DoctorReport['medications'] = []
  const notes: DoctorReport['notes'] = []
  const vaccinesGiven: VaccinationEvent[] = []
  for (const event of live.toSorted((a, b) => a.startAt - b.startAt)) {
    if (!inPeriod(event.startAt)) continue
    if (event.type === 'diaper' && event.data.poop) {
      const { color, consistency, curds } = event.data.poop
      if (UNUSUAL_COLOURS.has(color)) {
        poopFlags.color[color] = (poopFlags.color[color] ?? 0) + 1
      }
      if (consistency === 'watery') poopFlags.watery += 1
      if (curds) poopFlags.curds += 1
    }
    if (event.type === 'temperature') {
      temperatures.push({ at: event.startAt, celsius: event.data.celsius })
    }
    if (event.type === 'medication') {
      medications.push({ at: event.startAt, name: event.data.name, dose: event.data.dose })
    }
    if (event.type === 'note' && event.note) notes.push({ at: event.startAt, text: event.note })
    if (event.type === 'vaccination') vaccinesGiven.push(event)
  }

  const sex = baby.sex === 'male' ? 'male' : 'female'
  const growthEvents = live
    .filter((event) => event.type === 'growth')
    .toSorted((a, b) => a.startAt - b.startAt)
  const growth = (['weight', 'length', 'head'] as const).flatMap((measure): GrowthReading[] => {
    const readings = growthEvents.flatMap((event) => {
      const value = event.type === 'growth' ? event.data[FIELDS[measure]] : null
      return value === null ? [] : [{ value, at: event.startAt }]
    })
    const latest = readings.at(-1)
    if (!latest) return []
    const previous = readings.at(-2) ?? null
    return [
      {
        measure,
        value: latest.value,
        at: latest.at,
        percentile:
          baby.sex === 'unspecified'
            ? undefined
            : percentileOf(measure, sex, ageInMonths(baby.birthDate, latest.at), latest.value),
        previous,
      },
    ]
  })

  const today = localDateString(now)
  const given = new Map(
    live
      .filter((event): event is VaccinationEvent => event.type === 'vaccination')
      .map((event) => [
        `${event.data.vaccineId}:${event.data.dose}`,
        localDateString(event.startAt),
      ]),
  )
  const plan = baby.vaccinePlan ?? { region: 'cn' as const, picked: {}, selfPaid: [] }
  const monthAhead = localDateString(now + 30 * 24 * HOUR)
  const pending = vaccinePlan(baby.birthDate, baby.sex, today, plan, given)
  const vaccinesNext = [
    ...pending.filter((dose) => dose.state === 'overdue'),
    ...pending.filter(
      (dose) =>
        dose.state !== 'overdue' &&
        dose.state !== 'done' &&
        dose.state !== 'replaced' &&
        dose.dueDay <= monthAhead,
    ),
  ]

  return {
    from: localDateString(from),
    to: today,
    days: rows,
    averages,
    loggedDays: loggedRows.length,
    poopFlags,
    temperatures,
    medications,
    notes,
    growth,
    vaccinesGiven,
    vaccinesNext,
  }
}
