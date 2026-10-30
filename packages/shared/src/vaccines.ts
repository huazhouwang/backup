import type { BabySex } from './baby'
import { parseDay, shiftDay } from './date'

/**
 * The vaccines a baby in China gets: the national programme (国家免疫规划疫苗儿童免疫程序
 * 及说明, 2026 edition, National Disease Control and Prevention Administration, June 2026),
 * free; and the common self-paid ones, at the schedule most products give (the clinic has the
 * last word). Ages are in months from birth; `by` is the age to finish a dose by, as the
 * programme recommends, after which it is a catch-up.
 */
export interface VaccineDose {
  /** From this age (months; plus days, for a dose days after another). */
  months: number
  days?: number
  /** Finish by this age (months), else catch up. */
  by?: number
}

export interface Vaccine {
  id: string
  /** Short Chinese name, as clinics and the vaccination booklet say it. */
  name: string
  /** What it prevents. */
  against: string
  programme: 'national' | 'self-paid'
  doses: readonly VaccineDose[]
  /** One of a choice: only the chosen one of a group is planned. */
  choice?: { group: string; label: string }
  /** Girls only (HPV). */
  sex?: BabySex
  /** Self-paid: given in place of these national vaccines' doses (vaccine id: dose numbers). */
  replaces?: Readonly<Record<string, readonly number[]>>
}

export const VACCINES: readonly Vaccine[] = [
  {
    id: 'hepb',
    name: '乙肝疫苗',
    against: '乙型肝炎',
    programme: 'national',
    doses: [{ months: 0, days: 1 }, { months: 1 }, { months: 6, by: 12 }],
  },
  {
    id: 'bcg',
    name: '卡介苗',
    against: '结核病',
    programme: 'national',
    doses: [{ months: 0, by: 3 }],
  },
  {
    id: 'ipv',
    name: '脊灰灭活疫苗',
    against: '脊髓灰质炎',
    programme: 'national',
    doses: [{ months: 2 }, { months: 3 }],
  },
  {
    id: 'bopv',
    name: '脊灰减毒活疫苗',
    against: '脊髓灰质炎',
    programme: 'national',
    // Doses 3 and 4 of polio, after the two of IPV.
    doses: [
      { months: 4, by: 12 },
      { months: 48, by: 60 },
    ],
  },
  {
    id: 'dtap',
    name: '百白破疫苗',
    against: '百日咳、白喉、破伤风',
    programme: 'national',
    doses: [
      { months: 2 },
      { months: 4 },
      { months: 6, by: 12 },
      { months: 18, by: 24 },
      { months: 72, by: 84 },
    ],
  },
  {
    id: 'mmr',
    name: '麻腮风疫苗',
    against: '麻疹、风疹、流行性腮腺炎',
    programme: 'national',
    doses: [
      { months: 8, by: 12 },
      { months: 18, by: 24 },
    ],
  },
  {
    id: 'je-l',
    name: '乙脑减毒活疫苗',
    against: '流行性乙型脑炎',
    programme: 'national',
    choice: { group: 'je', label: '减毒活疫苗（2 剂）' },
    doses: [
      { months: 8, by: 12 },
      { months: 24, by: 36 },
    ],
  },
  {
    id: 'je-i',
    name: '乙脑灭活疫苗',
    against: '流行性乙型脑炎',
    programme: 'national',
    choice: { group: 'je', label: '灭活疫苗（4 剂）' },
    doses: [
      { months: 8 },
      // 7 to 10 days after the first.
      { months: 8, days: 7, by: 12 },
      { months: 24, by: 36 },
      { months: 72, by: 84 },
    ],
  },
  {
    id: 'mpsv-a',
    name: 'A 群流脑多糖疫苗',
    against: '流行性脑脊髓膜炎',
    programme: 'national',
    doses: [
      { months: 6, by: 12 },
      { months: 9, by: 24 },
    ],
  },
  {
    id: 'mpsv-ac',
    name: 'A 群 C 群流脑多糖疫苗',
    against: '流行性脑脊髓膜炎',
    programme: 'national',
    // Doses 3 and 4 of meningococcal vaccine.
    doses: [
      { months: 36, by: 48 },
      { months: 72, by: 84 },
    ],
  },
  {
    id: 'hepa-l',
    name: '甲肝减毒活疫苗',
    against: '甲型肝炎',
    programme: 'national',
    choice: { group: 'hepa', label: '减毒活疫苗（1 剂）' },
    doses: [{ months: 18, by: 24 }],
  },
  {
    id: 'hepa-i',
    name: '甲肝灭活疫苗',
    against: '甲型肝炎',
    programme: 'national',
    choice: { group: 'hepa', label: '灭活疫苗（2 剂）' },
    doses: [
      { months: 18, by: 24 },
      { months: 24, by: 36 },
    ],
  },
  {
    id: 'hpv2',
    name: '双价 HPV 疫苗',
    against: '人乳头瘤病毒感染',
    programme: 'national',
    sex: 'female',
    doses: [
      { months: 156, by: 168 },
      { months: 162, by: 168 },
    ],
  },
  {
    id: 'pcv13',
    name: '13 价肺炎疫苗',
    against: '肺炎球菌感染',
    programme: 'self-paid',
    doses: [{ months: 2 }, { months: 4 }, { months: 6 }, { months: 12 }],
  },
  {
    id: 'dtap-ipv-hib',
    name: '五联疫苗',
    against: '百白破、脊灰、b 型流感嗜血杆菌',
    programme: 'self-paid',
    doses: [{ months: 2 }, { months: 3 }, { months: 4 }, { months: 18 }],
    replaces: { dtap: [1, 2, 3, 4], ipv: [1, 2], bopv: [1], hib: [1, 2, 3, 4] },
  },
  {
    id: 'hib',
    name: 'Hib 疫苗',
    against: 'b 型流感嗜血杆菌',
    programme: 'self-paid',
    doses: [{ months: 2 }, { months: 3 }, { months: 4 }, { months: 18 }],
  },
  {
    id: 'rota',
    name: '五价轮状病毒疫苗',
    against: '轮状病毒腹泻',
    programme: 'self-paid',
    // From 6 weeks, 4 to 10 weeks apart, all by 32 weeks.
    doses: [{ months: 2 }, { months: 3 }, { months: 4, by: 7 }],
  },
  {
    id: 'ev71',
    name: '手足口（EV71）疫苗',
    against: '手足口病（EV71）',
    programme: 'self-paid',
    doses: [{ months: 6 }, { months: 7 }],
  },
  {
    id: 'varicella',
    name: '水痘疫苗',
    against: '水痘',
    programme: 'self-paid',
    doses: [{ months: 12 }, { months: 48 }],
  },
  {
    id: 'flu',
    name: '流感疫苗',
    against: '流行性感冒',
    programme: 'self-paid',
    // The first season two doses four weeks apart; after that one each autumn.
    doses: [{ months: 6 }, { months: 7 }],
  },
]

export const vaccineById = (id: string) => VACCINES.find((vaccine) => vaccine.id === id)

/** What a family has decided for a baby: which of each choice, which self-paid vaccines. */
export interface VaccineChoices {
  /** Choice group → the vaccine id picked (default: the first of the group). */
  picked: Readonly<Record<string, string>>
  /** Self-paid vaccine ids planned. */
  selfPaid: readonly string[]
}

export const NO_CHOICES: VaccineChoices = { picked: {}, selfPaid: [] }

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
  /** Given in place of it, when replaced (a self-paid vaccine's name). */
  replacedBy: string | null
}

/** A dose comes up this many days ahead: "soon". */
export const SOON_DAYS = 14

/**
 * Every dose planned for a baby, in the order they fall due, each with where it stands on
 * `today`: given (`given` maps "vaccine id:dose" to the day), replaced by a self-paid
 * vaccine, overdue (past its finish-by age), due, soon, or later.
 */
export function vaccinePlan(
  birthDate: string,
  sex: BabySex,
  today: string,
  choices: VaccineChoices,
  given: ReadonlyMap<string, string>,
): PlannedDose[] {
  const planned = VACCINES.filter((vaccine) => {
    if (vaccine.sex && sex !== vaccine.sex && sex !== 'unspecified') return false
    if (vaccine.programme === 'self-paid') return choices.selfPaid.includes(vaccine.id)
    if (!vaccine.choice) return true
    const group = vaccine.choice.group
    const first = VACCINES.find((other) => other.choice?.group === group)
    return (choices.picked[group] ?? first?.id) === vaccine.id
  })
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
        const due = dueDay(birthDate, dose)
        const byDay = dose.by === undefined ? null : dueDay(birthDate, { months: dose.by })
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
