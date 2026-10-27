import { inBabyScope } from '@lullabo/shared'
import { Hono } from 'hono'
import { z } from 'zod'

import { loadAccess } from '../access'
import { recentEvents } from '../agent/data'
import { ageOn } from '../agent/guide'
import { aiForUser } from '../agent/keys'
import { MIN_LOGGED_DAYS, WEEK, observe, weekLines } from '../tips/observe'
import type { AppEnv } from '../types'
import { modelOptionsFor } from '../voice/ai'
import { localDay } from '../voice/plan'
import { DAILY_LIMIT } from '../voice/tokens'
import { type AdapterFor, countMessage, readSettings } from './voice'

const querySchema = z.object({
  babyId: z.string().min(1).max(64),
  timeZone: z
    .string()
    .max(64)
    .refine((zone) => {
      try {
        return Boolean(new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions())
      } catch {
        return false
      }
    }),
})

/** Why there is no observation: too few records yet, no AI to write it, or it failed. */
type Missing = 'sparse' | 'noAi' | 'limited' | 'failed'

/** The Tips tab. Needs a session. */
export function tipsRoutes(adapterFor: AdapterFor) {
  return new Hono<AppEnv>().get('/observation', async (c) => {
    const query = querySchema.safeParse(c.req.query())
    if (!query.success) return c.json({ error: 'invalid' }, 400)
    const { babyId, timeZone } = query.data
    const db = c.env.DB
    const userId = c.get('user').id
    const now = Date.now()
    const day = localDay(now, timeZone)
    const access = await loadAccess(db, userId)
    const baby = await db
      .prepare(
        `select id, name, family_id as familyId, birth_date as birthDate from babies
         where id = ? and deleted_at is null`,
      )
      .bind(babyId)
      .first<{ id: string; name: string; familyId: string; birthDate: string }>()
    const family = baby ? access.get(baby.familyId) : undefined
    if (!baby || !family || !inBabyScope(family.babyIds, baby.id)) {
      return c.json({ error: 'not_found' }, 404)
    }
    const missing = (reason: Missing) => c.json({ day, text: null, reason })

    // Written at most once a day per baby, for everyone in the family.
    const kept = await db
      .prepare('select text from observations where baby_id = ? and day = ?')
      .bind(baby.id, day)
      .first<{ text: string }>()
    if (kept) return c.json({ day, text: kept.text })

    // Without an AI there is no observation at all, however much is recorded.
    const ai = await aiForUser(db, userId, access)
    const adapter =
      ai && ai.familyIds.includes(baby.familyId) ? await adapterFor(c.env, ai.ai) : null
    if (!ai || !adapter) return missing('noAi')

    const events = await recentEvents(db, [baby.id], now - (WEEK + 2) * 86_400_000, null, 1000)
    const { lines, logged } = weekLines(events, now, timeZone)
    // Too little to go on: nothing is asked of the model.
    if (logged < MIN_LOGGED_DAYS) return missing('sparse')
    const settings = await readSettings(db, userId)
    // It calls the model like a message does, so it counts towards the same daily limit.
    if ((await countMessage(db, userId, settings, now)) > DAILY_LIMIT) return missing('limited')

    const age = ageOn(baby.birthDate, now, timeZone)
    const text = await observe(
      adapter,
      modelOptionsFor(ai.ai.provider, ai.ai.model),
      { name: baby.name, age, months: age.totalDays / 30.44 },
      lines,
    )
    if (!text) return missing('failed')
    await db
      .prepare(
        `insert into observations (baby_id, day, text, created_at) values (?, ?, ?, ?)
         on conflict (baby_id, day) do nothing`,
      )
      .bind(baby.id, day, text, now)
      .run()
    return c.json({ day, text })
  })
}
