import { describe, expect, it } from 'vitest'

import { niceScale, niceStep, ticks } from './scale'

describe('niceStep', () => {
  it('picks 1, 2 or 5 times a power of ten for about five steps', () => {
    expect(niceStep(5)).toBe(1)
    expect(niceStep(12)).toBe(2)
    expect(niceStep(30)).toBe(5)
    expect(niceStep(0.8)).toBe(0.2)
  })
})

describe('niceScale', () => {
  it('rounds the top up to a round step of about a third, in the metric unit', () => {
    expect(niceScale(7, 1)).toEqual({ top: 10, step: 5 })
    expect(niceScale(650, 30)).toEqual({ top: 900, step: 300 })
    expect(niceScale(0, 1)).toEqual({ top: 0.5, step: 0.5 })
  })
})

describe('ticks', () => {
  it('lists the gridlines from the bottom to the top', () => {
    expect(ticks(0, 6, 2)).toEqual([0, 2, 4, 6])
    expect(ticks(3, 5, 0.5)).toEqual([3, 3.5, 4, 4.5, 5])
  })
})
