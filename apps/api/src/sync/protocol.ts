import {
  type Baby,
  type Event,
  type PushItemResult,
  type PushRejectReason,
  type RecordKind,
  babySchema,
  base64UrlDecode,
  base64UrlEncode,
  eventSchema,
  recordKind,
} from '@lullabo/shared'

/** Position in one table's change stream: rows are ordered by (seq, id). */
export type TableCursor = [seq: number, id: string]
export interface SyncCursor {
  babies: TableCursor
  events: TableCursor
}

const START: TableCursor = [0, '']

export function encodeCursor(cursor: SyncCursor): string {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify([cursor.babies, cursor.events])))
}

function isTableCursor(value: unknown): value is TableCursor {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    Number.isSafeInteger(value[0]) &&
    typeof value[1] === 'string'
  )
}

/** Unknown or malformed cursors restart from the beginning (a full, idempotent re-pull). */
export function decodeCursor(value: string | undefined): SyncCursor {
  if (!value) return { babies: START, events: START }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(base64UrlDecode(value)))
    if (Array.isArray(parsed) && isTableCursor(parsed[0]) && isTableCursor(parsed[1])) {
      return { babies: parsed[0], events: parsed[1] }
    }
  } catch {
    // Fall through to a fresh cursor.
  }
  return { babies: START, events: START }
}

export interface ExistingRow {
  id: string
  familyId: string | null
  updatedAt: number
  createdBy: string | null
  /** Only for events. */
  babyId?: string
}

export interface PlannedWrite<T> {
  results: PushItemResult[]
  /** Validated records to upsert, with server-controlled fields applied. */
  writes: T[]
}

/**
 * Decides per item whether it can be stored: schema validation, then the permission check,
 * then last write wins by updatedAt. createdBy is assigned by the server on first write and
 * immutable, so ownership checks for caregivers cannot be spoofed.
 */
export function planWrites<T extends Baby | Event>(
  items: readonly unknown[],
  parse: (item: unknown) => T | undefined,
  existing: ReadonlyMap<string, ExistingRow>,
  check: (record: T, existing: ExistingRow | undefined) => PushRejectReason | null,
  userId: string,
): PlannedWrite<T> {
  const results: PushItemResult[] = []
  const writes: T[] = []

  for (const item of items) {
    const record = parse(item)
    if (!record) {
      const id = typeof item === 'object' && item !== null && 'id' in item ? String(item.id) : ''
      results.push({ id, status: 'rejected', reason: 'invalid' })
      continue
    }
    const current = existing.get(record.id)
    const reason = check(record, current)
    if (reason) {
      results.push({ id: record.id, status: 'rejected', reason })
      continue
    }
    if (current && current.updatedAt > record.updatedAt) {
      results.push({ id: record.id, status: 'stale' })
      continue
    }
    writes.push({ ...record, createdBy: current ? current.createdBy : userId })
    results.push({ id: record.id, status: 'accepted' })
  }
  return { results, writes }
}

export const parseBaby = (item: unknown): Baby | undefined => babySchema.safeParse(item).data
export const parseEvent = (item: unknown): Event | undefined => eventSchema.safeParse(item).data

const LEGACY_INSTANTS: ReadonlySet<RecordKind> = new Set(['bottle', 'solids', 'pumping'])

/**
 * An event from an app older than RECORDS_VERSION, where bottles, solids and pumping had no
 * timer and no end meant "duration not recorded": now the end is the start.
 */
export function parseLegacyEvent(item: unknown): Event | undefined {
  const event = parseEvent(item)
  if (!event || event.endAt !== null || !LEGACY_INSTANTS.has(recordKind(event))) return event
  return { ...event, endAt: event.startAt }
}

/** Ids of raw pushed items, read before validation to look up what they would replace. */
export function idsOf(items: unknown[]): string[] {
  return items.flatMap((item) =>
    typeof item === 'object' && item !== null && 'id' in item && typeof item.id === 'string'
      ? [item.id]
      : [],
  )
}
