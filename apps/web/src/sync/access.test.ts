import type { FamilySummary } from '@lullabo/shared'
import { describe, expect, it } from 'vitest'

import { accessGrew, babyPermissions, canEditEvent } from './access'

const family = (overrides: Partial<FamilySummary> = {}): FamilySummary => ({
  id: 'f1',
  name: '家',
  role: 'owner',
  babyIds: null,
  ...overrides,
})

describe('accessGrew', () => {
  it('detects new families and newly visible babies', () => {
    expect(accessGrew([family()], [family(), family({ id: 'f2' })])).toBe(true)
    expect(accessGrew([family({ babyIds: ['a'] })], [family({ babyIds: ['a', 'b'] })])).toBe(true)
    expect(accessGrew([family({ babyIds: ['a'] })], [family()])).toBe(true)
  })

  it('ignores shrinking access and role changes', () => {
    expect(accessGrew([family(), family({ id: 'f2' })], [family()])).toBe(false)
    expect(accessGrew([family()], [family({ babyIds: ['a'] })])).toBe(false)
    expect(accessGrew([family()], [family({ role: 'viewer' })])).toBe(false)
  })
})

describe('permissions', () => {
  const access = [
    family({ id: 'owner' }),
    family({ id: 'care', role: 'caregiver' }),
    family({ id: 'view', role: 'viewer' }),
  ]

  it('allows everything for records outside known families', () => {
    expect(babyPermissions(undefined, { familyId: null })).toMatchObject({
      canLog: true,
      canManageBaby: true,
    })
    expect(babyPermissions(access, { familyId: 'unknown' }).canManageBaby).toBe(true)
  })

  it('follows the family role', () => {
    expect(babyPermissions(access, { familyId: 'owner' })).toMatchObject({
      canLog: true,
      canManageBaby: true,
      canManageMembers: true,
    })
    expect(babyPermissions(access, { familyId: 'care' })).toMatchObject({
      canLog: true,
      canManageBaby: false,
    })
    expect(babyPermissions(access, { familyId: 'view' }).canLog).toBe(false)
  })

  it('lets caregivers edit only their own events', () => {
    expect(canEditEvent(access, { familyId: 'care', createdBy: 'me' }, 'me')).toBe(true)
    expect(canEditEvent(access, { familyId: 'care', createdBy: 'other' }, 'me')).toBe(false)
    // Not pushed yet, so it can only be this device's own record.
    expect(canEditEvent(access, { familyId: 'care', createdBy: null }, 'me')).toBe(true)
    expect(canEditEvent(access, { familyId: 'view', createdBy: 'me' }, 'me')).toBe(false)
    expect(canEditEvent(access, { familyId: 'owner', createdBy: 'other' }, 'me')).toBe(true)
  })
})
