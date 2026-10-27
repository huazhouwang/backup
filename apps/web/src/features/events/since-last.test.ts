import { newId } from '@lullabo/shared'
import { describe, expect, it } from 'vitest'

import { describeEvent } from './describe'
import { logDiaper, logSleep, startBreastFeed, stopEvent, switchBreastSide } from './records'
import { sinceText } from './SinceLast'

const BABY = newId()
const MIN = 60_000
const NOW = new Date(2026, 9, 13, 10, 0).getTime()

describe('sinceText', () => {
  it('says 刚刚 and 刚醒 within a minute, also for a time a moment ahead of the clock', () => {
    expect(sinceText([logDiaper(BABY, NOW - 20_000, 'wet')], 'diaper', NOW)).toBe('刚刚')
    expect(sinceText([logDiaper(BABY, NOW + 20_000, 'wet')], 'diaper', NOW)).toBe('刚刚')
    expect(sinceText([logSleep(BABY, NOW - 60 * MIN, NOW + 30_000, NOW)], 'sleep', NOW)).toBe(
      '刚醒',
    )
    expect(sinceText([logDiaper(BABY, NOW - 5 * MIN, 'wet')], 'diaper', NOW)).toBe('5 分钟前')
  })
})

describe('describeEvent', () => {
  it('leaves out a breast side that was not fed', () => {
    const left = stopEvent(startBreastFeed(BABY, 'left', NOW - 10 * MIN), NOW)
    expect(describeEvent(left, NOW).detail).toBe('左 10 分钟')
    const both = stopEvent(
      switchBreastSide(startBreastFeed(BABY, 'left', NOW - 15 * MIN), NOW - 5 * MIN),
      NOW,
    )
    expect(describeEvent(both, NOW).detail).toBe('左 10 分钟 · 右 5 分钟')
  })
})
