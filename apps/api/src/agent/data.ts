import { type Event, inBabyScope, isRunning, newId } from '@lullabo/shared'

import { type Access, type FamilyAccess, checkEventWrite } from '../access'
import { parseEvent } from '../sync/protocol'
import { EVENT_COLUMNS, bumpSeq, upsertEvents } from '../sync/sql'
import type { VoiceBaby } from '../voice/plan'

// Reads and writes the agent's tools share. Writes go through the same checks and SQL as a
// sync push, so devices get them on their next pull.

type EventRow = Omit<Event, 'data'> & { data: string }

function toEvents(rows: EventRow[]): Event[] {
  return rows.flatMap((row) => {
    const event = parseEvent({ ...row, data: JSON.parse(row.data) })
    return event ? [event] : []
  })
}

/**
 * The babies the user may record for in these families: not archived, within their baby
 * scope. A name used in two families gets the family's name added, "小米粒（外婆家）", so the
 * model and the user can tell them apart.
 */
export async function writableBabies(
  db: D1Database,
  families: FamilyAccess[],
): Promise<VoiceBaby[]> {
  const recording = families.filter((family) => family.role !== 'viewer')
  if (recording.length === 0) return []
  const { results } = await db
    .prepare(
      `select id, name, family_id as familyId, birth_date as birthDate from babies
       where family_id in (select value from json_each(?)) and deleted_at is null
         and archived_at is null order by created_at`,
    )
    .bind(JSON.stringify(recording.map((family) => family.id)))
    .all<VoiceBaby>()
  const byId = new Map(recording.map((family) => [family.id, family]))
  const babies = results.filter((baby) => {
    const family = byId.get(baby.familyId)
    return family !== undefined && inBabyScope(family.babyIds, baby.id)
  })
  const counts = new Map<string, number>()
  for (const baby of babies) counts.set(baby.name, (counts.get(baby.name) ?? 0) + 1)
  for (const baby of babies) {
    if ((counts.get(baby.name) ?? 0) < 2) continue
    const family = byId.get(baby.familyId)
    baby.name = `${baby.name}（${family?.alias ?? family?.name ?? ''}）`
  }
  return babies
}

/** Duration records still running (sleeps, feeds, pumping), oldest first. */
export async function runningEvents(db: D1Database, babies: VoiceBaby[]) {
  if (babies.length === 0) return []
  const { results } = await db
    .prepare(
      `select ${EVENT_COLUMNS} from events
       where baby_id in (select value from json_each(?)) and end_at is null
         and deleted_at is null order by start_at`,
    )
    .bind(JSON.stringify(babies.map((baby) => baby.id)))
    .all<EventRow>()
  return toEvents(results).filter(isRunning)
}

/** Recent events of the babies, newest first. */
export async function recentEvents(
  db: D1Database,
  babyIds: string[],
  since: number,
  type: Event['type'] | null,
  limit: number,
) {
  if (babyIds.length === 0) return []
  const { results } = await db
    .prepare(
      `select ${EVENT_COLUMNS} from events
       where baby_id in (select value from json_each(?1)) and deleted_at is null
         and start_at >= ?2 and (?3 is null or type = ?3)
       order by start_at desc limit ?4`,
    )
    .bind(JSON.stringify(babyIds), since, type, limit)
    .all<EventRow>()
  return toEvents(results)
}

/**
 * Foods and medicines logged for the babies lately, most recent first: words a speech model
 * wouldn't expect, which the family uses.
 */
export async function spokenWords(db: D1Database, babyIds: string[], since: number) {
  if (babyIds.length === 0) return []
  const { results } = await db
    .prepare(
      `select word from (
         select coalesce(json_extract(data, '$.food'), json_extract(data, '$.name')) as word,
           max(start_at) as last
         from events
         where baby_id in (select value from json_each(?1)) and deleted_at is null
           and start_at >= ?2 and type in ('feeding', 'medication')
         group by word)
       where word is not null order by last desc limit 20`,
    )
    .bind(JSON.stringify(babyIds), since)
    .all<{ word: string }>()
  return results.map((row) => row.word)
}

export async function eventsByIds(db: D1Database, ids: string[]) {
  if (ids.length === 0) return []
  const { results } = await db
    .prepare(`select ${EVENT_COLUMNS} from events where id in (select value from json_each(?))`)
    .bind(JSON.stringify(ids))
    .all<EventRow>()
  return toEvents(results)
}

/** One write: the new version of an event and the stored one it replaces (null if added). */
export interface Change {
  event: Event
  before: Event | null
}

/**
 * Writes changes made in an agent turn, after checking each against the user's access, and
 * logs them so "撤销" can revert the turn. Returns the first refusal, if any (nothing is
 * written then).
 */
export async function writeChanges(
  db: D1Database,
  access: Access,
  userId: string,
  log: { threadId: string; runId: string } | null,
  changes: Change[],
  now: number,
): Promise<string | null> {
  for (const { event, before } of changes) {
    const refused = checkEventWrite(access, event, before ?? undefined, userId)
    if (refused) return refused
  }
  if (changes.length === 0) return null
  await db.batch([
    bumpSeq(db),
    upsertEvents(
      db,
      changes.map((change) => change.event),
    ),
    ...(log
      ? changes.map(({ event, before }) =>
          db
            .prepare(
              `insert into voice_ops (id, thread_id, run_id, event_id, before, created_at)
               values (?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              newId(now),
              log.threadId,
              log.runId,
              event.id,
              before ? JSON.stringify(before) : null,
              now,
            ),
        )
      : []),
  ])
  return null
}

/**
 * Reverts the latest turn in the thread that changed anything: added events are deleted,
 * changed ones put back, if all of them belong to `babyIds`. Returns the events reverted.
 */
export async function undoLastTurn(
  db: D1Database,
  access: Access,
  userId: string,
  threadId: string,
  babyIds: ReadonlySet<string>,
  now: number,
): Promise<{ reverted: Event[] } | { refused: string }> {
  const last = await db
    .prepare(
      'select run_id as runId from voice_ops where thread_id = ? order by created_at desc limit 1',
    )
    .bind(threadId)
    .first<{ runId: string }>()
  if (!last) return { reverted: [] }
  const { results: ops } = await db
    .prepare('select event_id as eventId, before from voice_ops where thread_id = ? and run_id = ?')
    .bind(threadId, last.runId)
    .all<{ eventId: string; before: string | null }>()
  const current = new Map(
    (
      await eventsByIds(
        db,
        ops.map((op) => op.eventId),
      )
    ).map((e) => [e.id, e]),
  )
  const changes: Change[] = []
  for (const op of ops) {
    const stored = current.get(op.eventId)
    if (!stored) continue
    // Only babies this turn may act on, even if the thread once had others.
    if (!babyIds.has(stored.babyId)) return { refused: 'forbidden' }
    const before = op.before === null ? null : parseEvent(JSON.parse(op.before))
    const event = before
      ? { ...before, updatedAt: now }
      : { ...stored, deletedAt: now, updatedAt: now }
    changes.push({ event, before: stored })
  }
  const refused = await writeChanges(db, access, userId, null, changes, now)
  if (refused) return { refused }
  await db
    .prepare('delete from voice_ops where thread_id = ? and run_id = ?')
    .bind(threadId, last.runId)
    .run()
  return { reverted: changes.map((change) => change.before ?? change.event) }
}
