import type { Event } from '@lullabo/shared'
import { T0, baseEvent } from '@lullabo/shared/testing'
import { describe, expect, it } from 'vitest'

import {
  draftFromBottle,
  draftFromMedication,
  draftFromPumping,
  draftsFrom,
  emptyDrafts,
  emptyBottle,
  parseBottleDraft,
  parseCelsius,
  parseMedication,
  parsePumping,
  parseSolids,
  showsMixedParts,
  withDrafts,
} from './drafts'

describe('bottle drafts', () => {
  it('round-trips a stored bottle', () => {
    const data = {
      kind: 'bottle',
      amountMl: 120,
      milk: 'mixed',
      breastMl: 70,
      formulaMl: 50,
    } as const
    expect(parseBottleDraft(draftFromBottle(data), true)).toEqual({ data })
    expect(parseBottleDraft(draftFromBottle(data))).toEqual({ data })
  })

  it('keeps the total of a mixed bottle logged without parts', () => {
    const draft = draftFromBottle({ kind: 'bottle', amountMl: 90, milk: 'mixed' })
    expect(showsMixedParts(draft, true)).toBe(false)
    expect(showsMixedParts(draft)).toBe(true)
    expect(parseBottleDraft(draft, true)).toEqual({
      data: { kind: 'bottle', amountMl: 90, milk: 'mixed' },
    })
  })

  it('asks for parts when a new mixed bottle has none', () => {
    const draft = { ...emptyBottle, milk: 'mixed' as const }
    expect(showsMixedParts(draft)).toBe(true)
    expect(parseBottleDraft(draft)).toHaveProperty('errors.amount')
  })
})

describe('other drafts', () => {
  it('requires solids food and a medication name', () => {
    expect(parseSolids('  ')).toHaveProperty('errors.food')
    expect(parseSolids(' 米粉 ')).toEqual({ data: { kind: 'solids', food: '米粉' } })
    expect(parseMedication({ name: '', dose: '' })).toHaveProperty('errors.name')
    expect(parseMedication({ name: ' 布洛芬 ', dose: ' ' })).toEqual({
      data: { name: '布洛芬', dose: null },
    })
    expect(draftFromMedication({ name: '布洛芬', dose: null })).toEqual({
      name: '布洛芬',
      dose: '',
    })
  })

  it('round-trips pumping and checks temperature ranges', () => {
    const data = { side: 'left', amountMl: 80 } as const
    expect(parsePumping(draftFromPumping(data))).toEqual({ data })
    expect(parsePumping({ side: 'both', amount: '' })).toHaveProperty('errors.amount')
    expect(parseCelsius('38.5')).toEqual({ data: { celsius: 38.5 } })
    expect(parseCelsius('50')).toHaveProperty('errors.celsius')
  })
})

describe('record drafts', () => {
  const pumping: Event = {
    ...baseEvent(),
    type: 'pumping',
    startAt: T0,
    endAt: null,
    data: { side: 'left' },
  }

  it('fills the drafts of a stored record and applies them back', () => {
    const event: Event = { ...pumping, endAt: T0 + 600_000, data: { side: 'left', amountMl: 80 } }
    const drafts = draftsFrom(event)
    expect(drafts.pumping).toEqual({ side: 'left', amount: '80' })
    expect(withDrafts(event, drafts)).toEqual({ event })
  })

  it('lets a running pumping go without an amount', () => {
    const drafts = { ...emptyDrafts, pumping: { side: 'right' as const, amount: ' ' } }
    expect(withDrafts(pumping, drafts)).toEqual({ event: { ...pumping, data: { side: 'right' } } })
  })

  it('returns the field errors of an invalid draft', () => {
    const event: Event = {
      ...baseEvent(),
      type: 'temperature',
      startAt: T0,
      endAt: null,
      data: { celsius: 37 },
    }
    expect(withDrafts(event, { ...draftsFrom(event), celsius: '50' })).toHaveProperty(
      'errors.celsius',
    )
  })
})
