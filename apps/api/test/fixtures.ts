import { type Baby, type Event, newId } from '@lullabo/shared'

export const T0 = Date.UTC(2026, 9, 13, 8)

export function baby(familyId: string | null, overrides: Partial<Baby> = {}): Baby {
  return {
    id: newId(),
    familyId,
    name: '小宝',
    birthDate: '2026-09-30',
    sex: 'unspecified',
    avatarColor: 'green',
    archivedAt: null,
    createdAt: T0,
    updatedAt: T0,
    deletedAt: null,
    createdBy: null,
    ...overrides,
  }
}

export function diaper(babyId: string, familyId: string, overrides: Partial<Event> = {}): Event {
  return {
    id: newId(),
    babyId,
    familyId,
    type: 'diaper',
    startAt: T0,
    endAt: null,
    note: null,
    data: { contents: 'wet' },
    createdAt: T0,
    updatedAt: T0,
    deletedAt: null,
    createdBy: null,
    ...overrides,
  } as Event
}
