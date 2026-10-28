import { newId } from '@lullabo/shared'

import type { AgentScope } from './scope'

/** A conversation continues while the user comes back within this long. */
export const SESSION_IDLE_MS = 30 * 60_000

/** Every thread of a user starts with this, so deleting the account can find them all. */
export const threadPrefix = (userId: string) => `voice_${userId}_`

/**
 * Every thread of a user as a key range, `thread_id >= ?from and thread_id < ?to`, which
 * the thread_id indexes serve (a substr() match would scan the table).
 */
export function threadRange(userId: string) {
  const from = threadPrefix(userId)
  const to = from.slice(0, -1) + String.fromCharCode(from.charCodeAt(from.length - 1) + 1)
  return { from, to }
}

/** The thread the user's next message goes to: the current one, or a new one after a pause. */
export async function currentThread(db: D1Database, scope: AgentScope, now: number) {
  const row = await db
    .prepare(
      `select thread_id as threadId, thread_active_at as activeAt, thread_scope as keyScope
       from voice_settings where user_id = ?`,
    )
    .bind(scope.userId)
    .first<{ threadId: string | null; activeAt: number | null; keyScope: string | null }>()
  const fresh =
    !row?.threadId ||
    row.activeAt === null ||
    now - row.activeAt > SESSION_IDLE_MS ||
    row.keyScope !== scope.keyScope
  const threadId = fresh ? `${threadPrefix(scope.userId)}${newId(now)}` : (row.threadId ?? '')
  await db
    .prepare(
      `insert into voice_settings (user_id, phrase, time_zone, thread_id, thread_active_at,
         thread_scope, updated_at)
       values (?1, ?2, ?3, ?4, ?5, ?6, ?5)
       on conflict (user_id) do update set thread_id = excluded.thread_id,
         thread_active_at = excluded.thread_active_at, thread_scope = excluded.thread_scope`,
    )
    .bind(scope.userId, scope.phrase, scope.timeZone, threadId, now, scope.keyScope)
    .run()
  return threadId
}
