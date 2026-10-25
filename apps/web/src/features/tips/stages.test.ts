import { describe, expect, it } from 'vitest'

import { tipById } from './library'
import { STAGES, doctorSignsFor, milestonesFor, stageFor } from './stages'

const age = (totalDays: number, months: number) => ({ totalDays, months, days: 0 })
const at = (id: string) => STAGES.find((stage) => stage.id === id)!

describe('stages', () => {
  it('goes by weeks for 12 weeks, then by months up to 24', () => {
    expect(stageFor(age(0, 0)).id).toBe('w1')
    expect(stageFor(age(20, 0)).id).toBe('w3')
    expect(stageFor(age(83, 2)).id).toBe('w12')
    expect(stageFor(age(84, 2)).id).toBe('m3')
    expect(stageFor(age(130, 4)).id).toBe('m4')
    expect(stageFor(age(1000, 32)).id).toBe('m24')
  })

  it('shows the milestones of the checkpoint ahead, and the signs of the one reached', () => {
    expect(milestonesFor(at('w3')).by).toBe(2)
    expect(milestonesFor(at('w12')).by).toBe(4)
    expect(milestonesFor(at('m4')).by).toBe(4)
    expect(milestonesFor(at('m5')).by).toBe(6)
    expect(milestonesFor(at('m24')).by).toBe(24)
    expect(doctorSignsFor(at('w1')).from).toBe(0)
    expect(doctorSignsFor(at('m4')).from).toBe(2.5)
    expect(doctorSignsFor(at('m9')).from).toBe(8)
  })

  it('names only tips that exist', () => {
    for (const stage of STAGES) {
      for (const id of stage.tips) expect(tipById(id), `${stage.id} → ${id}`).toBeDefined()
    }
  })
})
