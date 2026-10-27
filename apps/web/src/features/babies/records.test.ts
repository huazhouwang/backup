import { babySchema } from '@lullabo/shared'
import { describe, expect, it } from 'vitest'

import { buildBaby, nextAvatarColor, resolveSelectedBaby } from './records'

const input = {
  name: ' 小宝 ',
  birthDate: '2026-09-30',
  sex: 'female',
  avatarColor: 'green',
} as const

describe('buildBaby', () => {
  it('creates a valid local-only record', () => {
    const baby = buildBaby(input, 1_000)
    expect(babySchema.parse(baby)).toEqual(baby)
    expect(baby).toMatchObject({ name: '小宝', familyId: null, createdAt: 1_000, updatedAt: 1_000 })
  })
})

describe('resolveSelectedBaby', () => {
  const first = buildBaby(input, 1_000)
  const second = buildBaby({ ...input, name: '二宝' }, 2_000)
  const archived = { ...buildBaby({ ...input, name: '旧' }, 500), archivedAt: 3_000 }

  it('uses the stored selection when it is still active', () => {
    expect(resolveSelectedBaby([first, second], second.id)).toBe(second)
  })

  it('falls back to the oldest active baby', () => {
    expect(resolveSelectedBaby([second, first, archived], null)).toBe(first)
    expect(resolveSelectedBaby([first, archived], archived.id)).toBe(first)
  })

  it('returns nothing when there are no active babies', () => {
    expect(resolveSelectedBaby([archived], archived.id)).toBeUndefined()
  })
})

describe('nextAvatarColor', () => {
  it('avoids colors already in use', () => {
    expect(nextAvatarColor([])).toBe('green')
    expect(nextAvatarColor([buildBaby(input)])).toBe('blue')
  })
})
