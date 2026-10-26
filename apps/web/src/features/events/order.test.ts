import { MINUTE, newId } from '@bobo/shared'
import { describe, expect, it } from 'vitest'

import { newestFirst } from './order'
import { logDiaper, logSleep, startSleep } from './records'

const BABY = newId()
// 00:38, with the seconds the records were made at.
const T0 = new Date(2026, 9, 26, 0, 38, 0).getTime()

describe('newestFirst', () => {
  it('lists the newest start first', () => {
    const early = logDiaper(BABY, T0, 'wet', T0)
    const late = logDiaper(BABY, T0 + 5 * MINUTE, 'wet', T0)
    expect([early, late].toSorted(newestFirst)).toEqual([late, early])
  })

  it('within a minute, lists what ended later first, so a sleep comes after the diaper', () => {
    const diaper = logDiaper(BABY, T0 + 40_000, 'wet', T0)
    const sleep = logSleep(BABY, T0 + 10_000, T0 + 137 * MINUTE, T0 + 137 * MINUTE)
    expect([diaper, sleep].toSorted(newestFirst)).toEqual([sleep, diaper])
    const running = startSleep(BABY, T0 + 5_000)
    expect([diaper, running].toSorted(newestFirst)).toEqual([running, diaper])
  })
})
