import { noChoices } from '@lullabo/shared'
import { describe, expect, it } from 'vitest'

import { importDoses, savedPlan, withAppointment, withCustom, withoutCustom } from './plan-edit'

const plan = noChoices('cn')

describe('changing the vaccination plan', () => {
  it('books a dose for another day, and puts it back', () => {
    const booked = withAppointment(plan, 'hepb:3', '2026-11-25')
    expect(booked.appointments).toEqual({ 'hepb:3': '2026-11-25' })
    expect(withAppointment(booked, 'hepb:3', null).appointments).toEqual({})
  })

  it('adds a vaccine of the family’s own on its days, and takes it away again', () => {
    const { plan: added, id } = withCustom(plan, ' 狂犬病疫苗 ', ['2026-11-01', '2026-11-04'])
    expect(id).toMatch(/^custom-[a-z0-9]{12}$/)
    expect(added.custom).toEqual([{ id, name: '狂犬病疫苗', doses: 2 }])
    expect(added.appointments).toEqual({ [`${id}:1`]: '2026-11-01', [`${id}:2`]: '2026-11-04' })
    const removed = withoutCustom(added, id)
    expect(removed.custom).toEqual([])
    expect(removed.appointments).toEqual({})
  })

  it('always saves every part, empty or not', () => {
    expect(savedPlan(plan)).toEqual({
      region: 'cn',
      picked: {},
      selfPaid: [],
      appointments: {},
      custom: [],
    })
  })
})

describe('saving doses read off a booklet', () => {
  it('records known ones, names the others as the family’s own, and skips those on record', () => {
    const { plan: next, records } = importDoses(
      plan,
      [
        { vaccineId: 'hepb', name: '乙肝', dose: 1, date: '2026-05-21' },
        { vaccineId: 'hepb', name: '乙肝', dose: 2, date: '2026-06-20' },
        { vaccineId: null, name: '狂犬病疫苗', dose: 1, date: '2026-07-01' },
        { vaccineId: null, name: '狂犬病 疫苗'.replace(' ', ''), dose: 2, date: '2026-07-04' },
      ],
      new Set(['hepb:1']),
    )
    const own = next.custom?.[0]
    expect(next.custom).toHaveLength(1)
    expect(own).toMatchObject({ name: '狂犬病疫苗', doses: 2 })
    expect(records).toEqual([
      { vaccineId: 'hepb', dose: 2, day: '2026-06-20' },
      { vaccineId: own?.id, name: '狂犬病疫苗', dose: 1, day: '2026-07-01' },
      { vaccineId: own?.id, name: '狂犬病疫苗', dose: 2, day: '2026-07-04' },
    ])
  })
})
