import type { Baby, Event } from '@lullabo/shared'

import type { TableCursor } from './protocol'

// All statements take record lists as a single JSON parameter expanded with json_each, so a
// push or pull costs a handful of D1 queries regardless of size (the free plan allows 50
// queries per invocation and 100 bound parameters per statement).

const NEXT_SEQ = '(select s.value from sync_seq s where s.id = 1)'

export function bumpSeq(db: D1Database) {
  return db.prepare('update sync_seq set value = value + 1 where id = 1')
}

export function selectExisting(db: D1Database, table: 'babies' | 'events', ids: string[]) {
  const babyColumn = table === 'events' ? ', baby_id as babyId' : ''
  return db
    .prepare(
      `select id, family_id as familyId, updated_at as updatedAt, created_by as createdBy${babyColumn}
       from ${table} where id in (select value from json_each(?))`,
    )
    .bind(JSON.stringify(ids))
}

export function upsertBabies(db: D1Database, babies: Baby[]) {
  return db
    .prepare(
      `insert into babies (id, family_id, name, birth_date, sex, avatar_color, archived_at,
         vaccine_plan, created_at, updated_at, deleted_at, created_by, seq)
       select json_extract(j.value, '$.id'), json_extract(j.value, '$.familyId'),
         json_extract(j.value, '$.name'), json_extract(j.value, '$.birthDate'),
         json_extract(j.value, '$.sex'), json_extract(j.value, '$.avatarColor'),
         json_extract(j.value, '$.archivedAt'), json_extract(j.value, '$.vaccinePlan'),
         json_extract(j.value, '$.createdAt'),
         json_extract(j.value, '$.updatedAt'), json_extract(j.value, '$.deletedAt'),
         json_extract(j.value, '$.createdBy'), ${NEXT_SEQ}
       from json_each(?) j where true
       on conflict (id) do update set
         name = excluded.name, birth_date = excluded.birth_date, sex = excluded.sex,
         avatar_color = excluded.avatar_color, archived_at = excluded.archived_at,
         -- Apps from before the plan existed leave it out: keep what is there.
         vaccine_plan = coalesce(excluded.vaccine_plan, babies.vaccine_plan),
         updated_at = excluded.updated_at, deleted_at = excluded.deleted_at, seq = excluded.seq
       where excluded.updated_at >= babies.updated_at and babies.family_id = excluded.family_id`,
    )
    .bind(JSON.stringify(babies))
}

export function upsertEvents(db: D1Database, events: Event[]) {
  return db
    .prepare(
      `insert into events (id, baby_id, family_id, type, start_at, end_at, data, note,
         created_at, updated_at, deleted_at, created_by, seq)
       select json_extract(j.value, '$.id'), json_extract(j.value, '$.babyId'),
         json_extract(j.value, '$.familyId'), json_extract(j.value, '$.type'),
         json_extract(j.value, '$.startAt'), json_extract(j.value, '$.endAt'),
         json_extract(j.value, '$.data'), json_extract(j.value, '$.note'),
         json_extract(j.value, '$.createdAt'), json_extract(j.value, '$.updatedAt'),
         json_extract(j.value, '$.deletedAt'), json_extract(j.value, '$.createdBy'), ${NEXT_SEQ}
       from json_each(?) j where true
       on conflict (id) do update set
         baby_id = excluded.baby_id, type = excluded.type, start_at = excluded.start_at,
         end_at = excluded.end_at, data = excluded.data, note = excluded.note,
         updated_at = excluded.updated_at, deleted_at = excluded.deleted_at, seq = excluded.seq
       where excluded.updated_at >= events.updated_at and events.family_id = excluded.family_id`,
    )
    .bind(JSON.stringify(events))
}

/** An events row as an Event's fields (data still JSON text). */
export const EVENT_COLUMNS = `id, baby_id as babyId, family_id as familyId, type, start_at as startAt,
  end_at as endAt, data, note, created_at as createdAt, updated_at as updatedAt,
  deleted_at as deletedAt, created_by as createdBy`

/** Bindings for `(seq > ? or (seq = ? and id > ?))`, i.e. strictly after the cursor. */
function after(cursor: TableCursor): [number, number, string] {
  return [cursor[0], cursor[0], cursor[1]]
}

export function selectBabiesPage(
  db: D1Database,
  scope: { familyIds: string[]; babyIds: string[] },
  cursor: TableCursor,
  limit: number,
) {
  return db
    .prepare(
      `select id, family_id as familyId, name, birth_date as birthDate, sex,
         avatar_color as avatarColor, archived_at as archivedAt, vaccine_plan as vaccinePlan,
         created_at as createdAt,
         updated_at as updatedAt, deleted_at as deletedAt, created_by as createdBy, seq
       from babies
       where (family_id in (select value from json_each(?)) or id in (select value from json_each(?)))
         and (seq > ? or (seq = ? and id > ?))
       order by seq, id limit ?`,
    )
    .bind(JSON.stringify(scope.familyIds), JSON.stringify(scope.babyIds), ...after(cursor), limit)
}

export function selectEventsPage(
  db: D1Database,
  scope: { familyIds: string[]; babyIds: string[] },
  cursor: TableCursor,
  limit: number,
) {
  return db
    .prepare(
      `select ${EVENT_COLUMNS}, seq
       from events
       where (family_id in (select value from json_each(?)) or baby_id in (select value from json_each(?)))
         and (seq > ? or (seq = ? and id > ?))
       order by seq, id limit ?`,
    )
    .bind(JSON.stringify(scope.familyIds), JSON.stringify(scope.babyIds), ...after(cursor), limit)
}

/** Removes the records and reminders of deleted babies (their rows stay as tombstones). */
export function deleteBabyData(db: D1Database, babyIds: readonly string[]) {
  const ids = JSON.stringify(babyIds)
  return [
    db.prepare('delete from events where baby_id in (select value from json_each(?))').bind(ids),
    db.prepare('delete from reminders where baby_id in (select value from json_each(?))').bind(ids),
    db
      .prepare('delete from vaccine_reminders where baby_id in (select value from json_each(?))')
      .bind(ids),
  ]
}
