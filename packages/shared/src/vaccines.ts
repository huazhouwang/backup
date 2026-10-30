import type { BabySex } from './baby'
import { parseDay, shiftDay } from './date'
import { AU } from './vaccine-schedules/au'
import { CA } from './vaccine-schedules/ca'
import { CN } from './vaccine-schedules/cn'
import { GB } from './vaccine-schedules/gb'
import { SG } from './vaccine-schedules/sg'
import { US } from './vaccine-schedules/us'

/**
 * The places whose childhood schedule a baby can follow, each from its official source
 * (vaccine-schedules/). Ages are in months from birth; `by` is the age to finish a dose by,
 * as the schedule recommends, after which it is a catch-up.
 */
export const VACCINE_REGIONS = ['cn', 'us', 'gb', 'ca', 'au', 'sg'] as const
export type VaccineRegion = (typeof VACCINE_REGIONS)[number]

export interface VaccineDose {
  /** From this age (months; plus days, for a dose days after another). */
  months: number
  days?: number
  /** Finish by this age (months), else catch up. */
  by?: number
}

export interface Vaccine {
  /** Unique across regions: a record keeps it wherever the family lives later. */
  id: string
  /** Short Chinese name, as clinics in China say it. */
  name: string
  /** Its name where it is given (DTaP, 6-in-1), as the clinic and the booklet write it. */
  local?: string
  /** What it prevents. */
  against: string
  /** On the schedule for every child (in China, free), or one the family may add. */
  programme: 'routine' | 'optional'
  doses: readonly VaccineDose[]
  /** One of a choice: only the chosen one of a group is planned. */
  choice?: { group: string; label: string }
  /** Added by the family, not on any schedule: its doses fall on the days they set. */
  custom?: boolean
  /** Girls only (HPV). */
  sex?: BabySex
  /** Optional: given in place of these routine vaccines' doses (vaccine id: dose numbers). */
  replaces?: Readonly<Record<string, readonly number[]>>
}

const SCHEDULES: Readonly<Record<VaccineRegion, readonly Vaccine[]>> = {
  cn: CN,
  us: US,
  gb: GB,
  ca: CA,
  au: AU,
  sg: SG,
}

/** The vaccines on a region's schedule, routine and optional. */
export const vaccinesOf = (region: VaccineRegion): readonly Vaccine[] => SCHEDULES[region]

/** Every vaccine of every region. */
export const VACCINES: readonly Vaccine[] = VACCINE_REGIONS.flatMap((region) => SCHEDULES[region])

export const vaccineById = (id: string) => VACCINES.find((vaccine) => vaccine.id === id)

/**
 * What a family has decided for a baby: whose schedule, which of each choice, which optional
 * vaccines (`selfPaid`, as China calls them).
 */
export interface VaccineChoices {
  region: VaccineRegion
  /** Choice group → the vaccine id picked (default: the first of the group). */
  picked: Readonly<Record<string, string>>
  /** Optional vaccine ids planned. */
  selfPaid: readonly string[]
  /** "vaccine id:dose" → the day the clinic booked it for, in place of the schedule's. */
  appointments?: Readonly<Record<string, string>>
  /** Vaccines the family added, each dose on its appointment. */
  custom?: readonly CustomVaccine[]
}

export interface CustomVaccine {
  id: string
  name: string
  doses: number
}

/** A custom vaccine's id: "custom-" and letters or digits. */
export const CUSTOM_VACCINE_ID = /^custom-[a-z0-9]{4,24}$/

/** A family's own vaccine as the plan treats it: routine, each dose on its appointment. */
const customVaccine = ({ id, name, doses }: CustomVaccine): Vaccine => ({
  id,
  name,
  against: '',
  programme: 'routine',
  custom: true,
  doses: Array.from({ length: doses }, () => ({ months: 0 })),
})

export const noChoices = (region: VaccineRegion): VaccineChoices => ({
  region,
  picked: {},
  selfPaid: [],
})

/** The day a dose falls due: months then days after birth, on the calendar. */
export function dueDay(birthDate: string, dose: Pick<VaccineDose, 'months' | 'days'>): string {
  const birth = parseDay(birthDate)
  const total = birth.month - 1 + dose.months
  const year = birth.year + Math.floor(total / 12)
  const month = (total % 12) + 1
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const day = Math.min(birth.day, last)
  const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return dose.days ? shiftDay(date, dose.days) : date
}

export type DoseState = 'done' | 'replaced' | 'overdue' | 'due' | 'soon' | 'later'

export interface PlannedDose {
  vaccine: Vaccine
  /** 1-based, as the booklet counts. */
  dose: number
  dueDay: string
  /** The day to finish by, if the programme sets one. */
  byDay: string | null
  state: DoseState
  /** The day it was given, when done. */
  givenDay: string | null
  /** Given in place of it, when replaced (an optional vaccine's name). */
  replacedBy: string | null
  /** Booked for a day of the family's choosing, not the schedule's. */
  appointed: boolean
}

/** A dose comes up this many days ahead: "soon". */
export const SOON_DAYS = 14

/**
 * Every dose planned for a baby on its region's schedule, and the family's own vaccines, in
 * the order they fall due, each with where it stands on `today`: given (`given` maps
 * "vaccine id:dose" to the day), replaced by an optional vaccine, overdue (past its
 * finish-by age, or its appointment), due, soon, or later. A dose booked for another day
 * falls due on it.
 */
export function vaccinePlan(
  birthDate: string,
  sex: BabySex,
  today: string,
  choices: VaccineChoices,
  given: ReadonlyMap<string, string>,
): PlannedDose[] {
  const schedule = vaccinesOf(choices.region)
  const planned = schedule.filter((vaccine) => {
    if (vaccine.sex && sex !== vaccine.sex && sex !== 'unspecified') return false
    if (vaccine.programme === 'optional') return choices.selfPaid.includes(vaccine.id)
    if (!vaccine.choice) return true
    const group = vaccine.choice.group
    const first = schedule.find((other) => other.choice?.group === group)
    return (choices.picked[group] ?? first?.id) === vaccine.id
  })
  planned.push(...(choices.custom ?? []).map(customVaccine))
  const appointments = choices.appointments ?? {}
  const replacedBy = new Map<string, string>()
  for (const vaccine of planned) {
    for (const [id, doses] of Object.entries(vaccine.replaces ?? {})) {
      for (const dose of doses) replacedBy.set(`${id}:${dose}`, vaccine.name)
    }
  }
  const soon = shiftDay(today, SOON_DAYS)
  return planned
    .flatMap((vaccine) =>
      vaccine.doses.map((dose, index): PlannedDose => {
        const key = `${vaccine.id}:${index + 1}`
        const appointment = appointments[key]
        // A custom dose with no day set yet waits on the baby's birthday, as soon as can be.
        const due = appointment ?? dueDay(birthDate, dose)
        // Booked: due on the day, late after it, whatever the schedule's limit.
        const byDay = appointment
          ? shiftDay(appointment, 1)
          : dose.by === undefined
            ? null
            : dueDay(birthDate, { months: dose.by })
        const givenDay = given.get(key) ?? null
        const replacer = givenDay ? null : (replacedBy.get(key) ?? null)
        const state: DoseState = givenDay
          ? 'done'
          : replacer
            ? 'replaced'
            : byDay !== null && today >= byDay
              ? 'overdue'
              : due <= today
                ? 'due'
                : due <= soon
                  ? 'soon'
                  : 'later'
        return {
          vaccine,
          dose: index + 1,
          dueDay: due,
          byDay,
          state,
          givenDay,
          replacedBy: replacer,
          appointed: appointment !== undefined,
        }
      }),
    )
    .toSorted((a, b) => a.dueDay.localeCompare(b.dueDay))
}

/** Reminded this many days before a dose, besides on the day; overdue, once a week. */
export const VACCINE_NOTICE_DAYS = 3

export interface VaccineNotice {
  when: 'soon' | 'today' | 'overdue'
  doses: PlannedDose[]
}

/**
 * What to remind the family of on `today`, from a plan: doses due in three days, doses due
 * today, and doses still not given past their day, every seventh day after it. Empty on days
 * with nothing to say.
 */
export function vaccineNotices(plan: readonly PlannedDose[], today: string): VaccineNotice[] {
  const inThree = shiftDay(today, VACCINE_NOTICE_DAYS)
  const waiting = plan.filter((dose) => dose.state !== 'done' && dose.state !== 'replaced')
  const daysLate = (dose: PlannedDose) => {
    const [a, b] = [dose.dueDay, today].map((day) => {
      const { year, month, day: date } = parseDay(day)
      return Date.UTC(year, month - 1, date) / 86_400_000
    })
    return (b ?? 0) - (a ?? 0)
  }
  const notices: VaccineNotice[] = [
    { when: 'today', doses: waiting.filter((dose) => dose.dueDay === today) },
    { when: 'soon', doses: waiting.filter((dose) => dose.dueDay === inThree) },
    {
      when: 'overdue',
      doses: waiting.filter((dose) => {
        const late = daysLate(dose)
        return late > 0 && late % 7 === 0
      }),
    },
  ]
  return notices.filter((notice) => notice.doses.length > 0)
}
