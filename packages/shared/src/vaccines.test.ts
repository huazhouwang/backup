import { describe, expect, it } from 'vitest'

import { NO_CHOICES, VACCINES, dueDay, vaccineNotices, vaccinePlan } from './vaccines'

const BORN = '2026-03-31'
const keyOf = (dose: { vaccine: { id: string }; dose: number }) => `${dose.vaccine.id}:${dose.dose}`

describe('the vaccination plan', () => {
  it('counts months on the calendar, the last day of a short month standing in', () => {
    expect(dueDay(BORN, { months: 1 })).toBe('2026-04-30')
    expect(dueDay(BORN, { months: 11 })).toBe('2027-02-28')
    expect(dueDay(BORN, { months: 8, days: 7 })).toBe('2026-12-07')
  })

  it('plans the national programme, the first of each choice, nothing self-paid', () => {
    const plan = vaccinePlan(BORN, 'male', '2026-03-31', NO_CHOICES, new Map())
    const ids = new Set(plan.map((dose) => dose.vaccine.id))
    expect(ids.has('je-l')).toBe(true)
    expect(ids.has('je-i')).toBe(false)
    expect(ids.has('hepa-l')).toBe(true)
    expect(ids.has('pcv13')).toBe(false)
    // HPV is for girls.
    expect(ids.has('hpv2')).toBe(false)
    expect(plan.map(keyOf).slice(0, 3)).toEqual(['bcg:1', 'hepb:1', 'hepb:2'])
  })

  it('tells given, due, soon, later and overdue doses apart', () => {
    const given = new Map([['hepb:1', '2026-03-31']])
    const plan = vaccinePlan(BORN, 'female', '2026-07-20', NO_CHOICES, given)
    const state = (key: string) => plan.find((dose) => keyOf(dose) === key)?.state
    expect(state('hepb:1')).toBe('done')
    expect(state('hepb:2')).toBe('due')
    // Finish by 3 months: past it, a catch-up.
    expect(state('bcg:1')).toBe('overdue')
    expect(state('ipv:2')).toBe('due')
    // Four months old on 31 July: within a fortnight.
    expect(state('bopv:1')).toBe('soon')
    expect(state('dtap:2')).toBe('soon')
    expect(state('mpsv-a:1')).toBe('later')
    expect(plan.some((dose) => dose.vaccine.id === 'hpv2')).toBe(true)
    expect(
      vaccinePlan(BORN, 'male', '2026-10-01', NO_CHOICES, new Map()).find(
        (dose) => keyOf(dose) === 'mpsv-a:1',
      )?.state,
    ).toBe('due')
  })

  it('takes the chosen kind and self-paid vaccines, which stand in for national doses', () => {
    const choices = { picked: { je: 'je-i' }, selfPaid: ['dtap-ipv-hib', 'pcv13'] }
    const plan = vaccinePlan(BORN, 'male', '2026-05-01', choices, new Map())
    const find = (key: string) => plan.find((dose) => keyOf(dose) === key)
    expect(find('je-i:4')).toBeDefined()
    expect(find('je-l:1')).toBeUndefined()
    expect(find('pcv13:1')?.state).toBe('later')
    expect(find('dtap:1')?.state).toBe('replaced')
    expect(find('dtap:1')?.replacedBy).toBe('五联疫苗')
    expect(find('dtap:5')?.state).not.toBe('replaced')
    expect(find('bopv:2')?.state).toBe('later')
  })

  it('has unique ids, and doses in order', () => {
    expect(new Set(VACCINES.map((vaccine) => vaccine.id)).size).toBe(VACCINES.length)
    for (const vaccine of VACCINES) {
      const ages = vaccine.doses.map((dose) => dose.months * 31 + (dose.days ?? 0))
      expect(ages).toEqual(ages.toSorted((a, b) => a - b))
    }
  })
})

const plan = (today: string, given = new Map<string, string>()) =>
  vaccinePlan(BORN, 'male', today, NO_CHOICES, given)

describe('vaccination reminders', () => {
  it('reminds three days ahead and on the day', () => {
    // IPV 1 and DTaP 1 at two months: 31 May.
    const ahead = vaccineNotices(plan('2026-05-28'), '2026-05-28')
    expect(ahead.find((notice) => notice.when === 'soon')?.doses.map(keyOf)).toEqual([
      'ipv:1',
      'dtap:1',
    ])
    const onTheDay = vaccineNotices(plan('2026-05-31'), '2026-05-31')
    expect(onTheDay.find((notice) => notice.when === 'today')?.doses.map(keyOf)).toEqual([
      'ipv:1',
      'dtap:1',
    ])
  })

  it('reminds of a dose not given once a week after its day, and not once given', () => {
    const late = (today: string) =>
      vaccineNotices(plan(today), today).find((notice) => notice.when === 'overdue')
    expect(late('2026-06-07')?.doses.map(keyOf)).toContain('ipv:1')
    expect(late('2026-06-08')?.doses.map(keyOf) ?? []).not.toContain('ipv:1')
    const given = new Map([['ipv:1', '2026-06-01']])
    const after = vaccineNotices(plan('2026-06-07', given), '2026-06-07')
    expect(after.flatMap((notice) => notice.doses.map(keyOf))).not.toContain('ipv:1')
  })
})
