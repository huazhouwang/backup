import { describe, expect, it } from 'vitest'

import { parseGrowth } from './growth-input'

describe('parseGrowth', () => {
  it('accepts any subset of measurements', () => {
    expect(parseGrowth({ weight: '5.234', length: '', head: ' 38 ' })).toEqual({
      data: { weightKg: 5.234, lengthCm: null, headCm: 38 },
    })
  })

  it('requires one measurement and plausible values', () => {
    expect(parseGrowth({ weight: '', length: '', head: '' })).toHaveProperty('errors.form')
    expect(parseGrowth({ weight: '52', length: '10', head: '' })).toMatchObject({
      errors: { weight: expect.any(String), length: expect.any(String) },
    })
  })
})
