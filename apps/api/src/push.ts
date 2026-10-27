import type { PushMessage } from '@lullabo/shared'

import type { Env } from './env'
import {
  type PushResult,
  type PushTarget,
  type VapidKeys,
  generateVapidKeys,
  sendPush,
} from './web-push'

/** Device subscriptions, VAPID keys and delivery; reminders.ts decides what to send when. */

const VAPID_KEY_NAME = 'vapid'

/** The VAPID key pair, created and stored on first use so deploys need no extra secret. */
export async function getVapidKeys(db: D1Database): Promise<VapidKeys> {
  const read = () =>
    db
      .prepare('select value from server_keys where name = ?')
      .bind(VAPID_KEY_NAME)
      .first<{ value: string }>()
  let row = await read()
  if (!row) {
    const keys = await generateVapidKeys()
    // Concurrent first uses race here; whichever insert lands first wins and both read it.
    await db
      .prepare('insert or ignore into server_keys (name, value, created_at) values (?, ?, ?)')
      .bind(VAPID_KEY_NAME, JSON.stringify(keys), Date.now())
      .run()
    row = await read()
  }
  if (!row) throw new Error('VAPID keys unavailable')
  const keys: VapidKeys = JSON.parse(row.value)
  return keys
}

type SubscriptionRow = PushTarget & { userId: string }

export async function subscriptionsOf(
  db: D1Database,
  userIds: string[],
): Promise<SubscriptionRow[]> {
  if (userIds.length === 0) return []
  const { results } = await db
    .prepare(
      `select endpoint, p256dh, auth, user_id as userId from push_subscriptions
       where user_id in (select value from json_each(?))`,
    )
    .bind(JSON.stringify(userIds))
    .all<SubscriptionRow>()
  return results
}

/** Sends a message to every device of a user; expired subscriptions are removed. */
export async function notifyUser(
  env: Pick<Env, 'DB' | 'BETTER_AUTH_URL'>,
  userId: string,
  message: PushMessage,
  now: number,
  fetcher?: typeof fetch,
): Promise<PushResult[]> {
  const targets = await subscriptionsOf(env.DB, [userId])
  if (targets.length === 0) return []
  const keys = await getVapidKeys(env.DB)
  const results = await Promise.all(
    targets.map((target) => sendPush(target, message, keys, env.BETTER_AUTH_URL, now, fetcher)),
  )
  await removeGone(env.DB, targets, results)
  return results
}

/** Deletes subscriptions the push service reported as gone. */
export async function removeGone(db: D1Database, targets: PushTarget[], results: PushResult[]) {
  const gone = targets.filter((_, i) => results[i] === 'gone').map((target) => target.endpoint)
  if (gone.length === 0) return
  await db
    .prepare('delete from push_subscriptions where endpoint in (select value from json_each(?))')
    .bind(JSON.stringify(gone))
    .run()
}
