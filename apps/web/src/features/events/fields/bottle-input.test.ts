import { describe, expect, it } from 'vitest'

import { mixedTotal, parseBottle } from './bottle-input'

describe('parseBottle', () => {
  const input = { milk: 'formula' as const, amount: '120', breast: '', formula: '' }

  it('uses the total for breast milk or formula bottles', () => {
    expect(parseBottle(input)).toEqual({ amountMl: 120 })
    expect(parseBottle({ ...input, amount: '0' })).toHaveProperty('error')
  })

  it('adds up the parts of a mixed bottle', () => {
    expect(parseBottle({ ...input, milk: 'mixed', breast: '70', formula: '50' })).toEqual({
      amountMl: 120,
      split: { breastMl: 70, formulaMl: 50 },
    })
    // An empty part counts as none.
    expect(parseBottle({ ...input, milk: 'mixed', breast: '', formula: '90' })).toEqual({
      amountMl: 90,
      split: { breastMl: 0, formulaMl: 90 },
    })
    expect(parseBottle({ ...input, milk: 'mixed', breast: '', formula: '' })).toHaveProperty(
      'error',
    )
    expect(parseBottle({ ...input, milk: 'mixed', breast: '600', formula: '600' })).toHaveProperty(
      'error',
    )
    expect(parseBottle({ ...input, milk: 'mixed', breast: '-5', formula: '60' })).toHaveProperty(
      'error',
    )
  })

  it('shows a running total', () => {
    expect(mixedTotal({ breast: '70', formula: '' })).toBe(70)
    expect(mixedTotal({ breast: 'x', formula: '5' })).toBe(0)
  })
})
