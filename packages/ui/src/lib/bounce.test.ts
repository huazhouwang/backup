import { describe, expect, it } from 'vitest'

import { rubberBand } from './bounce'

describe('rubberBand', () => {
  it('follows the finger closely at first, then resists, never past the length', () => {
    expect(rubberBand(0, 800)).toBe(0)
    expect(rubberBand(10, 800)).toBeGreaterThan(5)
    expect(rubberBand(400, 800)).toBeLessThan(200)
    expect(rubberBand(100_000, 800)).toBeLessThan(800)
    expect(rubberBand(-100, 800)).toBe(-rubberBand(100, 800))
  })
})
