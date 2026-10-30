import { describe, expect, it } from 'vitest'

import { guessRegion } from './region'

describe('the region a device seems to be in', () => {
  it('goes by the time zone, China when it can’t tell', () => {
    expect(guessRegion('Asia/Shanghai')).toBe('cn')
    expect(guessRegion('America/Los_Angeles')).toBe('us')
    expect(guessRegion('America/Indiana/Indianapolis')).toBe('us')
    expect(guessRegion('America/Toronto')).toBe('ca')
    expect(guessRegion('Europe/London')).toBe('gb')
    expect(guessRegion('Australia/Sydney')).toBe('au')
    expect(guessRegion('Asia/Singapore')).toBe('sg')
    expect(guessRegion('Asia/Tokyo')).toBe('cn')
    expect(guessRegion('America/Mexico_City')).toBe('cn')
  })
})
