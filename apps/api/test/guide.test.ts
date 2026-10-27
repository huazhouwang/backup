import type { Event } from '@lullabo/shared'
import { describe, expect, it } from 'vitest'

import { ageLabel, implausible, nextUpLines } from '../src/agent/guide'

const NOW = Date.UTC(2026, 9, 17, 2, 0)
const ZONE = 'Asia/Shanghai'

const base = {
  id: 'e1',
  babyId: 'b1',
  familyId: 'f1',
  startAt: NOW - 60_000,
  endAt: null,
  note: null,
  createdAt: NOW,
  updatedAt: NOW,
  deletedAt: null,
  createdBy: null,
}

function bottle(amountMl: number, startAt = base.startAt): Event {
  return {
    ...base,
    startAt,
    type: 'feeding',
    data: { kind: 'bottle', amountMl, milk: 'formula' },
  }
}

describe('ages', () => {
  it('labels ages the way parents say them', () => {
    expect(ageLabel({ totalDays: 17, months: 0, days: 17 })).toBe('出生 17 天')
    expect(ageLabel({ totalDays: 100, months: 3, days: 8 })).toBe('3 个月 8 天')
    expect(ageLabel({ totalDays: 800, months: 26, days: 0 })).toBe('2 岁 2 个月')
  })
})

describe('implausible', () => {
  const newborn = '2026-09-30'

  it('doubts amounts far beyond the age, and allows usual ones', () => {
    expect(implausible(bottle(500), null, newborn, NOW, ZONE)).toContain('500 毫升')
    expect(implausible(bottle(90), null, newborn, NOW, ZONE)).toBeNull()
    expect(implausible(bottle(500), null, '2025-10-01', NOW, ZONE)).toContain('500 毫升')
    expect(implausible(bottle(240), null, '2025-10-01', NOW, ZONE)).toBeNull()
  })

  it('doubts times in the future', () => {
    expect(implausible(bottle(60, NOW + 3_600_000), null, newborn, NOW, ZONE)).toBe('时间在将来')
  })

  it('doubts solids for a newborn and a long sleep that was said, not a timer left running', () => {
    const solids: Event = { ...base, type: 'feeding', data: { kind: 'solids', food: '米粉' } }
    expect(implausible(solids, null, newborn, NOW, ZONE)).toContain('辅食')
    const sleep: Event = {
      ...base,
      type: 'sleep',
      startAt: NOW - 12 * 3_600_000,
      endAt: NOW,
      data: { kind: 'night' },
    }
    expect(implausible(sleep, null, newborn, NOW, ZONE)).toContain('12 小时')
    expect(implausible(sleep, { ...sleep, endAt: null }, newborn, NOW, ZONE)).toBeNull()
  })
})

describe('what comes next', () => {
  // Four months old; 10:00 in Shanghai.
  const birthDate = '2026-06-10'

  it('tells the assistant when the next feed is, on the family’s clock', () => {
    const fed = { ...bottle(120, NOW - 60 * 60_000), endAt: NOW - 50 * 60_000 }
    expect(nextUpLines([fed], birthDate, NOW, ZONE)[0]).toBe(
      '下次喂奶大约 12:15–12:45（按月龄估算）',
    )
    expect(nextUpLines([bottle(120)], birthDate, NOW, ZONE)[0]).toBe('正在喂')
  })
})
