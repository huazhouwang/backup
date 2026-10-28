import { type Observation, inBabyScope } from '@lullabo/shared'
import { Hono } from 'hono'
import { z } from 'zod'

import { loadAccess } from '../access'
import { payingAi, withinDailyLimit } from '../agent/budget'
import { recentEvents } from '../agent/data'
import { ageOn } from '../agent/guide'
import { modelOptionsFor } from '../ai/providers'
import { fail, query } from '../http'
import { localDay } from '../time-zone'
import { MIN_LOGGED_DAYS, WEEK, observe, weekLines } from '../tips/observe'
import type { AppEnv } from '../types'
import { timeZoneSchema } from '../validation'
import { readSettings } from '../voice/settings'

const querySchema = z.object({
  babyId: z.string().min(1).max(64),
  timeZone: timeZoneSchema,
})

/** Why there is no observation: too few records yet, no AI to write it, or it failed. */
type Missing = Extract<Observation, { text: null }>['reason']

/** The Tips tab. Needs a session. */
export const tipsRoutes = new Hono<AppEnv>().get('/observation', query(querySchema), async (c) => {
  const { babyId, timeZone } = c.req.valid('query')
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
  if (!baby || !family || !inBabyScope(family.babyIds, baby.id)) fail('not_found')
  const missing = (reason: Missing) => c.json({ day, text: null, reason } satisfies Observation)

  // Written at most once a day per baby, for everyone in the family.
  const kept = await db
    .prepare('select text from observations where baby_id = ? and day = ?')
    .bind(baby.id, day)
    .first<{ text: string }>()
  if (kept) return c.json({ day, text: kept.text } satisfies Observation)

  // Without an AI there is no observation at all, however much is recorded.
  const paying = await payingAi(c.env, c.get('adapterFor'), userId, access, baby.familyId)
  if (!paying) return missing('noAi')
  const { ai, adapter } = paying

  const events = await recentEvents(db, [baby.id], now - (WEEK + 2) * 86_400_000, null, 1000)
  const { lines, logged } = weekLines(events, now, timeZone)
  // Too little to go on: nothing is asked of the model.
  if (logged < MIN_LOGGED_DAYS) return missing('sparse')
  const settings = await readSettings(db, userId)
  // It calls the model like a message does, so it counts towards the same daily limit.
  if (!(await withinDailyLimit(db, userId, settings, now))) return missing('limited')

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
  return c.json({ day, text } satisfies Observation)
})
