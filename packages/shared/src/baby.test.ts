import { describe, expect, it } from 'vitest'

import { babySchema } from './baby'
import { newId } from './id'
import { syncMeta } from './testing'

function baby(overrides: Record<string, unknown> = {}) {
  return {
    id: newId(),
    familyId: null,
    name: '小宝',
    birthDate: '2026-09-30',
    sex: 'unspecified',
    avatarColor: 'green',
    archivedAt: null,
    ...syncMeta(),
    ...overrides,
  }
}

describe('babySchema', () => {
  it('accepts a local-only baby', () => {
    expect(babySchema.parse(baby())).toMatchObject({ name: '小宝', familyId: null })
  })

  it('trims names and rejects empty ones', () => {
    expect(babySchema.parse(baby({ name: '  小宝 ' })).name).toBe('小宝')
    expect(babySchema.safeParse(baby({ name: '   ' })).success).toBe(false)
  })

  it('requires a calendar date for the birth date', () => {
    expect(babySchema.safeParse(baby({ birthDate: '2026-02-30' })).success).toBe(false)
    expect(babySchema.safeParse(baby({ birthDate: '2026-09-30T00:00:00Z' })).success).toBe(false)
  })

  it('rejects updatedAt before createdAt', () => {
    expect(babySchema.safeParse(baby({ updatedAt: 0 })).success).toBe(false)
  })
})
