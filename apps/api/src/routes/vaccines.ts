import { bookletPhotoRequestSchema, inBabyScope } from '@lullabo/shared'
import { Hono } from 'hono'

import { loadAccess } from '../access'
import { aiForUser } from '../agent/keys'
import { decryptKey } from '../ai/key-crypto'
import { fail, json } from '../http'
import type { AppEnv } from '../types'
import { BookletReadError } from '../vaccine-photo'

/** Vaccination help that needs the server: reading a booklet photo with the family's AI. */
export const vaccineRoutes = new Hono<AppEnv>().post(
  '/read',
  json(bookletPhotoRequestSchema),
  async (c) => {
    const { babyId, region, image } = c.req.valid('json')
    const db = c.env.DB
    const userId = c.get('user').id
    const access = await loadAccess(db, userId)
    const baby = await db
      .prepare(
        'select family_id as familyId, birth_date as birthDate from babies where id = ? and deleted_at is null',
      )
      .bind(babyId)
      .first<{ familyId: string; birthDate: string }>()
    const family = baby ? access.get(baby.familyId) : undefined
    // Only those who can record for the baby: what is read becomes its records.
    if (!baby || !family || family.role === 'viewer' || !inBabyScope(family.babyIds, babyId)) {
      fail('not_found')
    }
    // The key voice logging spends for this family, own or shared.
    const choice = await aiForUser(db, userId, access)
    if (!choice || !choice.familyIds.includes(baby.familyId)) fail('no_key')
    if (!c.env.ENCRYPTION_SECRET) fail('not_configured')
    const apiKey = await decryptKey(c.env.ENCRYPTION_SECRET, choice.ai.keyCipher)
    try {
      const doses = await c.get('bookletReader')({
        provider: choice.ai.provider,
        model: choice.ai.model,
        apiKey,
        image,
        region,
        birthDate: baby.birthDate,
      })
      return c.json({ doses })
    } catch (error) {
      if (
        error instanceof BookletReadError ||
        (error instanceof Error && error.name === 'TimeoutError')
      ) {
        fail('unreadable')
      }
      throw error
    }
  },
)
