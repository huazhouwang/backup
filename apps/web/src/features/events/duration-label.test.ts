import { describe, expect, it } from 'vitest'

import { durationLabel } from './duration-label'

describe('durationLabel', () => {
  it('formats zero, sub-minute, minutes and hours', () => {
    expect(durationLabel(0)).toBe('0 分钟')
    expect(durationLabel(20_000)).toBe('不到 1 分钟')
    expect(durationLabel(45 * 60_000)).toBe('45 分钟')
    expect(durationLabel(120 * 60_000)).toBe('2 小时')
    expect(durationLabel(80 * 60_000)).toBe('1 小时 20 分钟')
  })

  it('has a short form for tight spots', () => {
    expect(durationLabel(83 * 60_000, { short: true })).toBe('1小时23分')
    expect(durationLabel(45 * 60_000, { short: true })).toBe('45 分钟')
  })
})
