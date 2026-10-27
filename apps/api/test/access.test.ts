import { type Baby, type Event, type FamilyRole, newId } from '@lullabo/shared'
import { describe, expect, it } from 'vitest'

import { type Access, checkBabyWrite, checkEventWrite, readScope } from '../src/access'

const F = newId()
const BABY_A = newId()
const BABY_B = newId()
const ME = 'me'

function access(role: FamilyRole, babyIds: string[] | null = null): Access {
  return new Map([
    [
      F,
      {
        id: F,
        name: '家',
        role,
        babyIds: babyIds ? new Set(babyIds) : null,
        alias: null,
        memberCount: 1,
      },
    ],
  ])
}

const baby = (id = BABY_A) => ({ id, familyId: F }) as Baby
const event = (babyId = BABY_A) => ({ id: newId(), babyId, familyId: F }) as Event
const mine = { familyId: F, babyId: BABY_A, createdBy: ME }
const theirs = { familyId: F, babyId: BABY_A, createdBy: 'someone-else' }

describe('checkBabyWrite', () => {
  it.each([
    ['owner', null],
    ['admin', null],
    ['caregiver', 'forbidden'],
    ['viewer', 'forbidden'],
  ] as const)('%s managing babies → %s', (role, expected) => {
    expect(checkBabyWrite(access(role), baby(), undefined)).toBe(expected)
  })

  it('limits scoped admins to their babies', () => {
    expect(checkBabyWrite(access('admin', [BABY_A]), baby(BABY_A), { familyId: F })).toBeNull()
    expect(checkBabyWrite(access('admin', [BABY_A]), baby(BABY_B), undefined)).toBe('forbidden')
  })

  it('rejects families the user is not in and moves between families', () => {
    expect(checkBabyWrite(new Map(), baby(), undefined)).toBe('forbidden')
    expect(checkBabyWrite(access('owner'), baby(), { familyId: newId() })).toBe('family_mismatch')
  })
})

describe('checkEventWrite', () => {
  it.each([
    // role, existing, expected
    ['owner', theirs, null],
    ['admin', theirs, null],
    ['caregiver', undefined, null],
    ['caregiver', mine, null],
    ['caregiver', theirs, 'forbidden'],
    ['viewer', undefined, 'forbidden'],
    ['viewer', mine, 'forbidden'],
  ] as const)('%s writing %o → %s', (role, existing, expected) => {
    expect(checkEventWrite(access(role), event(), existing, ME)).toBe(expected)
  })

  it('limits every role to the babies in scope', () => {
    const scoped = access('caregiver', [BABY_A])
    expect(checkEventWrite(scoped, event(BABY_A), undefined, ME)).toBeNull()
    expect(checkEventWrite(scoped, event(BABY_B), undefined, ME)).toBe('forbidden')
    // Moving an event from an out-of-scope baby into scope is not allowed either.
    expect(checkEventWrite(scoped, event(BABY_A), { ...mine, babyId: BABY_B }, ME)).toBe(
      'forbidden',
    )
  })
})

describe('readScope', () => {
  it('splits whole families from individually shared babies', () => {
    const other = newId()
    const combined: Access = new Map([
      [F, { id: F, name: 'a', role: 'owner', babyIds: null, alias: null, memberCount: 1 }],
      [
        other,
        {
          id: other,
          name: 'b',
          role: 'viewer',
          babyIds: new Set([BABY_B]),
          alias: null,
          memberCount: 1,
        },
      ],
    ])
    expect(readScope(combined)).toEqual({ familyIds: [F], babyIds: [BABY_B] })
  })
})
