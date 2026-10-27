import { MINUTE, type PushMessage, type ReminderKind } from '@lullabo/shared'

import { memberSeesBaby } from './access'
import type { Env } from './env'
import { getVapidKeys, removeGone, subscriptionsOf } from './push'
import { type PushResult, type PushTarget, sendPush } from './web-push'

/** Reminders not sent within this long after they were due are skipped (e.g. after an outage). */
const LATE_LIMIT = 3 * 60 * MINUTE
/** Bounded so one cron run stays well within the free plan's CPU limit. */
const BATCH = 20
/**
 * Pushes per run (reminders × each user's devices): every push is a subrequest and costs an
 * encryption and a signature, so a run stays inside the Workers limits. Reminders past it
 * wait for the next minute.
 */
export const MAX_SENDS = 30

export interface DueReminder {
  userId: string
  babyId: string
  kind: ReminderKind
  intervalMinutes: number
  babyName: string
  lastAt: number
}

// Latest start of an event of the reminder's kind for the baby.
const LATEST = `(select max(e.start_at) from events e
  where e.baby_id = r.baby_id and e.type = r.kind and e.deleted_at is null)`

/**
 * Reminders whose interval has passed since the latest event of their kind, not yet sent for
 * that event, for babies the user can still see.
 */
export async function dueReminders(db: D1Database, now: number): Promise<DueReminder[]> {
  const { results } = await db
    .prepare(
      `select * from (
         select r.user_id as userId, r.baby_id as babyId, r.kind, r.interval_minutes as intervalMinutes,
           r.fired_for as firedFor, b.name as babyName, ${LATEST} as lastAt
         from reminders r
         join babies b on b.id = r.baby_id and b.deleted_at is null and b.archived_at is null
         join memberships m on m.family_id = b.family_id and m.user_id = r.user_id
         where r.enabled = 1 and ${memberSeesBaby('r.baby_id')}
       )
       where lastAt is not null
         and lastAt + intervalMinutes * 60000 <= ?1
         and lastAt + intervalMinutes * 60000 > ?1 - ?2
         and (firedFor is null or firedFor < lastAt)
       limit ?3`,
    )
    .bind(now, LATE_LIMIT, BATCH)
    .all<DueReminder>()
  return results
}

/** "3 小时 5 分钟" */
function elapsedLabel(ms: number): string {
  const minutes = Math.floor(ms / MINUTE)
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} 分钟`
  return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分钟`
}

// The app ships in Chinese only so far; notifications match it.
const TITLES: Record<ReminderKind, string> = { feeding: '该喂奶啦', diaper: '该看看尿布啦' }
const SINCE: Record<ReminderKind, string> = { feeding: '距上次喂养', diaper: '距上次换尿布' }

export function reminderMessage(reminder: DueReminder, now: number): PushMessage {
  return {
    title: TITLES[reminder.kind],
    body: `${reminder.babyName} ${SINCE[reminder.kind]}已经 ${elapsedLabel(now - reminder.lastAt)}`,
    tag: `reminder-${reminder.babyId}-${reminder.kind}`,
    url: '/',
  }
}

/** Cron entry point: sends due reminders and marks them sent. */
export async function dispatchReminders(
  env: Pick<Env, 'DB' | 'BETTER_AUTH_URL'>,
  now: number,
  fetcher?: typeof fetch,
): Promise<number> {
  const db = env.DB
  const due = await dueReminders(db, now)
  if (due.length === 0) return 0

  const targets = await subscriptionsOf(db, [...new Set(due.map((reminder) => reminder.userId))])
  const keys = targets.length > 0 ? await getVapidKeys(db) : undefined
  const sends: Promise<PushResult>[] = []
  const sentTo: PushTarget[] = []
  const handled: DueReminder[] = []
  for (const reminder of due) {
    const devices = keys ? targets.filter((target) => target.userId === reminder.userId) : []
    // The first always goes, so a user with many devices is never stuck.
    if (handled.length > 0 && sends.length + devices.length > MAX_SENDS) break
    handled.push(reminder)
    const message = reminderMessage(reminder, now)
    for (const target of devices) {
      if (!keys) continue
      sentTo.push(target)
      sends.push(sendPush(target, message, keys, env.BETTER_AUTH_URL, now, fetcher))
    }
  }
  const results = await Promise.all(sends)

  // Marked even without a device to send to, so each gap is considered once; reminders left
  // for the next run stay unmarked.
  await db.batch(
    handled.map((reminder) =>
      db
        .prepare(
          'update reminders set fired_for = ? where user_id = ? and baby_id = ? and kind = ?',
        )
        .bind(reminder.lastAt, reminder.userId, reminder.babyId, reminder.kind),
    ),
  )
  await removeGone(db, sentTo, results)
  return results.filter((result) => result === 'sent').length
}
