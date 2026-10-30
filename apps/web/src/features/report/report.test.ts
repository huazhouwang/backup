import { type Baby, newId } from '@lullabo/shared'
import { describe, expect, it } from 'vitest'

import {
  logBottle,
  logDiaper,
  logGrowth,
  logMedication,
  logNote,
  logSleep,
  logTemperature,
  logVaccination,
} from '../events/records'
import { buildReport } from './report'

const H = 3_600_000
const at = (day: number, hour: number) => new Date(2026, 9, day, hour).getTime()
const NOW = at(14, 20)

const baby: Baby = {
  id: newId(),
  familyId: null,
  name: '小米粒',
  birthDate: '2026-07-10',
  sex: 'female',
  avatarColor: 'green',
  archivedAt: null,
  createdAt: 0,
  updatedAt: 0,
  deletedAt: null,
  createdBy: null,
}
const id = baby.id

describe('the doctor’s report', () => {
  it('averages over the days logged, not the days with nothing', () => {
    const events = [
      logBottle(id, at(13, 6), 100, 'formula'),
      logBottle(id, at(13, 9), 120, 'formula'),
      logBottle(id, at(14, 7), 90, 'formula'),
      logBottle(id, at(14, 10), 110, 'formula'),
      logSleep(id, at(13, 12), at(13, 14), at(13, 14)),
      logDiaper(id, at(14, 8), 'mixed'),
    ]
    const report = buildReport(baby, events, 7, NOW)
    expect(report.from).toBe('2026-10-08')
    expect(report.to).toBe('2026-10-14')
    expect(report.days).toHaveLength(7)
    expect(report.loggedDays).toBe(2)
    expect(report.averages).toMatchObject({
      feedings: 2,
      bottleMl: 210,
      sleepMs: H,
      wet: 0.5,
      dirty: 0.5,
      feedIntervalMs: 3 * H,
    })
    expect(buildReport(baby, [], 7, NOW).averages).toBeNull()
  })

  it('lists temperatures, medicines and notes, and poop worth a look', () => {
    const events = [
      logTemperature(id, at(12, 8), 38.4),
      logMedication(id, at(12, 9), '布洛芬', '2.5 ml'),
      logNote(id, at(12, 10), '吐奶两次'),
      logDiaper(id, at(13, 8), {
        contents: 'dirty',
        poop: { amount: 'normal', color: 'white', consistency: 'watery' },
      }),
      logDiaper(id, at(13, 9), {
        contents: 'dirty',
        poop: { amount: 'normal', color: 'yellow', consistency: 'soft' },
      }),
      // Before the period: not in it.
      logTemperature(id, at(1, 8), 39),
    ]
    const report = buildReport(baby, events, 7, NOW)
    expect(report.temperatures).toEqual([{ at: at(12, 8), celsius: 38.4 }])
    expect(report.medications).toEqual([{ at: at(12, 9), name: '布洛芬', dose: '2.5 ml' }])
    expect(report.notes).toEqual([{ at: at(12, 10), text: '吐奶两次' }])
    expect(report.poopFlags).toEqual({ color: { white: 1 }, watery: 1, curds: 0 })
  })

  it('gives the latest growth with its percentile and the reading before', () => {
    const events = [
      logGrowth(id, at(1, 10), { weightKg: 5.1, lengthCm: 58, headCm: null }),
      logGrowth(id, at(12, 10), { weightKg: 5.6, lengthCm: null, headCm: null }),
    ]
    const [weight, length] = buildReport(baby, events, 7, NOW).growth
    expect(weight).toMatchObject({ measure: 'weight', value: 5.6, previous: { value: 5.1 } })
    expect(weight?.percentile).toBeGreaterThan(3)
    expect(length).toMatchObject({ measure: 'length', value: 58, previous: null })
  })

  it('names vaccinations given in the period, and those overdue or coming', () => {
    const events = [
      logVaccination(id, at(10, 10), { vaccineId: 'hepb', dose: 1, reactions: ['fever'] }),
    ]
    const report = buildReport(baby, events, 7, NOW)
    expect(report.vaccinesGiven.map((event) => event.data.vaccineId)).toEqual(['hepb'])
    const next = report.vaccinesNext.map((dose) => `${dose.vaccine.id}:${dose.dose}`)
    // Born 10 July: BCG is past its limit; the second hepatitis B dose is late.
    expect(next).toContain('bcg:1')
    expect(next).not.toContain('hepb:1')
  })
})
