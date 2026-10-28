// Builders for tests across the packages (`@lullabo/shared/testing`); never imported by app
// code. Each record is valid against its schema, with sensible defaults to override.
import type { Baby } from './baby'
import { MINUTE } from './date'
import type { Event } from './event'
import { newId } from './id'

export const T0 = Date.UTC(2026, 9, 13, 8, 0)
export { MINUTE } from './date'

export function syncMeta(at = T0) {
  return { createdAt: at, updatedAt: at, deletedAt: null, createdBy: null }
}

export function baseEvent(at = T0) {
  return { id: newId(), babyId: newId(), familyId: null, note: null, ...syncMeta(at) }
}

/** A baby with no family, born a fortnight before T0. */
export function testBaby(overrides: Partial<Baby> = {}): Baby {
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

/** A finished bottle feed; `minutes` null records no duration. */
export function bottleEvent(
  startAt: number,
  { minutes = 10, amountMl = 120 }: { minutes?: number | null; amountMl?: number } = {},
): Event {
  return {
    ...baseEvent(startAt),
    type: 'feeding',
    startAt,
    endAt: minutes === null ? null : startAt + minutes * MINUTE,
    data: { kind: 'bottle', amountMl, milk: 'formula' },
  }
}

/** A breastfeed on one side, finished; `minutes` null leaves it running. */
export function breastEvent(
  startAt: number,
  { minutes = 15, side = 'left' }: { minutes?: number | null; side?: 'left' | 'right' } = {},
): Event {
  const endAt = minutes === null ? null : startAt + minutes * MINUTE
  return {
    ...baseEvent(startAt),
    type: 'feeding',
    startAt,
    endAt,
    data: { kind: 'breast', segments: [{ side, startAt, endAt }] },
  }
}

/** A sleep; `endAt` null is one still going. */
export function sleepEvent(
  startAt: number,
  endAt: number | null,
  kind: 'nap' | 'night' = 'nap',
): Event {
  return { ...baseEvent(startAt), type: 'sleep', startAt, endAt, data: { kind } }
}

export function diaperEvent(at: number, contents: 'wet' | 'dirty' | 'mixed' = 'wet'): Event {
  return { ...baseEvent(at), type: 'diaper', startAt: at, endAt: null, data: { contents } }
}
