import {
  type Baby,
  type Event,
  type PullResponse,
  type PushResponse,
  RECORDS_VERSION,
  LEGACY_RECORDS_VERSION_HEADER,
  RECORDS_VERSION_HEADER,
  SYNC_PULL_LIMIT,
  SYNC_PUSH_LIMIT,
  pushRequestSchema,
  vaccinePlanSchema,
} from '@lullabo/shared'
import { Hono } from 'hono'

import { checkBabyWrite, checkEventWrite, loadAccess, readScope, toSummaries } from '../access'
import { type EventRow, toEvent } from '../db/events'
import { fail, json } from '../http'
import {
  type ExistingRow,
  type SyncCursor,
  type TableCursor,
  decodeCursor,
  encodeCursor,
  parseBaby,
  parseEvent,
  parseLegacyEvent,
  planWrites,
  idsOf,
} from '../sync/protocol'
import {
  bumpSeq,
  deleteBabyData,
  selectBabiesPage,
  selectEventsPage,
  selectExisting,
  upsertBabies,
  upsertEvents,
} from '../sync/sql'
import type { AppEnv } from '../types'

type BabyRow = Omit<Baby, 'vaccinePlan'> & { vaccinePlan: string | null; seq: number }

const toMap = (rows: ExistingRow[]) => new Map(rows.map((row) => [row.id, row]))

function lastOf(rows: readonly { seq: number; id: string }[], fallback: TableCursor): TableCursor {
  const last = rows.at(-1)
  return last ? [last.seq, last.id] : fallback
}

function toBaby({ seq: _seq, vaccinePlan, ...baby }: BabyRow): Baby {
  // Left out until someone sets it, as apps send it.
  return vaccinePlan === null ? baby : { ...baby, vaccinePlan: parsePlan(vaccinePlan) }
}

/** A stored plan, or none if it no longer reads as one. */
function parsePlan(text: string): Baby['vaccinePlan'] {
  try {
    const parsed = vaccinePlanSchema.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export const syncRoutes = new Hono<AppEnv>()
  .post('/push', json(pushRequestSchema), async (c) => {
    const { babies, events } = c.req.valid('json')
    if (babies.length + events.length > SYNC_PUSH_LIMIT) fail('too_large')

    const db = c.env.DB
    const userId = c.get('user').id
    const access = await loadAccess(db, userId)

    const [existingBabies, existingEvents] = await db.batch<ExistingRow>([
      selectExisting(db, 'babies', idsOf(babies)),
      selectExisting(db, 'events', idsOf(events)),
    ])
    const babyPlan = planWrites<Baby>(
      babies,
      parseBaby,
      toMap(existingBabies?.results ?? []),
      (baby, current) => checkBabyWrite(access, baby, current),
      userId,
    )
    const version =
      c.req.header(RECORDS_VERSION_HEADER) ?? c.req.header(LEGACY_RECORDS_VERSION_HEADER)
    const upToDate = version === RECORDS_VERSION
    const eventPlan = planWrites<Event>(
      events,
      upToDate ? parseEvent : parseLegacyEvent,
      toMap(existingEvents?.results ?? []),
      (event, current) =>
        checkEventWrite(
          access,
          event,
          current && { ...current, babyId: current.babyId ?? event.babyId },
          userId,
        ),
      userId,
    )

    if (babyPlan.writes.length + eventPlan.writes.length > 0) {
      // A deleted baby takes its records and reminders with it; devices drop the events
      // themselves when they pull the baby's tombstone.
      const deleted = babyPlan.writes.filter((baby) => baby.deletedAt !== null).map((b) => b.id)
      // One transaction: the sequence bump and the upserts commit together, so a pull never
      // sees rows whose seq is ahead of a concurrent push.
      await db.batch([
        bumpSeq(db),
        ...(babyPlan.writes.length > 0 ? [upsertBabies(db, babyPlan.writes)] : []),
        ...(eventPlan.writes.length > 0 ? [upsertEvents(db, eventPlan.writes)] : []),
        ...(deleted.length > 0 ? deleteBabyData(db, deleted) : []),
      ])
    }

    const response: PushResponse = { babies: babyPlan.results, events: eventPlan.results }
    return c.json(response)
  })
  .get('/pull', async (c) => {
    const db = c.env.DB
    const cursor = decodeCursor(c.req.query('cursor'))
    const access = await loadAccess(db, c.get('user').id)
    const scope = readScope(access)
    if (scope.familyIds.length === 0 && scope.babyIds.length === 0) {
      const empty: PullResponse = {
        babies: [],
        events: [],
        access: [],
        cursor: encodeCursor(cursor),
        hasMore: false,
      }
      return c.json(empty)
    }

    const [babyRows, eventRows] = await Promise.all([
      selectBabiesPage(db, scope, cursor.babies, SYNC_PULL_LIMIT + 1).all<BabyRow>(),
      selectEventsPage(db, scope, cursor.events, SYNC_PULL_LIMIT + 1).all<
        EventRow & { seq: number }
      >(),
    ])
    const babyPage = babyRows.results.slice(0, SYNC_PULL_LIMIT)
    const eventPage = eventRows.results.slice(0, SYNC_PULL_LIMIT)
    const hasMore =
      babyRows.results.length > SYNC_PULL_LIMIT || eventRows.results.length > SYNC_PULL_LIMIT

    const next: SyncCursor = {
      babies: lastOf(babyPage, cursor.babies),
      events: lastOf(eventPage, cursor.events),
    }

    const response: PullResponse = {
      babies: babyPage.map(toBaby),
      events: eventPage.map(toEvent),
      access: toSummaries(access),
      cursor: encodeCursor(next),
      hasMore,
    }
    return c.json(response)
  })
