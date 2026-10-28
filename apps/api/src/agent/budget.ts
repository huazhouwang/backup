import type { AnyTextAdapter } from '@tanstack/ai'

import type { Access } from '../access'
import type { Env } from '../env'
import { type Settings, countMessage } from '../voice/settings'
import { DAILY_LIMIT } from '../voice/tokens'
import { type SavedAi, aiForUser } from './keys'

// Who pays for a call to the model, and whether they may make another today. A message to the
// agent and the Tips tab's observation both ask, in this order.

/** The model behind a saved AI setting; tests pass a fake instead of calling a provider. */
export type AdapterFor = (env: Env, ai: SavedAi) => Promise<AnyTextAdapter | null>

/**
 * The AI whose key the user's call to the model spends, with its model: null without one, or
 * when it may not record for `familyId`.
 */
export async function payingAi(
  env: Env,
  adapterFor: AdapterFor,
  userId: string,
  access: Access,
  familyId?: string,
) {
  const ai = await aiForUser(env.DB, userId, access)
  if (!ai || (familyId !== undefined && !ai.familyIds.includes(familyId))) return null
  const adapter = await adapterFor(env, ai.ai)
  return adapter ? { ai, adapter } : null
}

/**
 * Counts a call to the model, for Siri, the chat box and tips together: nobody runs up their
 * own or a shared key's bill. False once the user is past the day's limit.
 */
export async function withinDailyLimit(
  db: D1Database,
  userId: string,
  settings: Settings,
  now: number,
) {
  return (await countMessage(db, userId, settings, now)) <= DAILY_LIMIT
}
