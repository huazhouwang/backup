import type { FamilyAi, ProviderModels, UserAi } from '@lullabo/shared'
import { Hono } from 'hono'
import { z } from 'zod'

import { type FamilyEnv, familyManager, familyMember, loadAccess } from '../access'
import { sharedAis } from '../agent/keys'
import { decryptKey, encryptKey, keyHint } from '../ai/key-crypto'
import {
  AI_PROVIDERS,
  type AiModel,
  AiKeyError,
  type AiProvider,
  firstChoice,
  listModels,
} from '../ai/providers'
import { fail, json } from '../http'
import type { AppEnv } from '../types'

const providerSchema = z.enum(AI_PROVIDERS)
const keySchema = z.object({ apiKey: z.string().trim().min(8).max(300) })
const chooseModelSchema = z.object({
  provider: providerSchema,
  model: z.string().trim().min(1).max(120),
})
const sharesSchema = z.object({ familyIds: z.array(z.string().max(64)).max(50) })
const chooseSchema = z.object({ userId: z.string().max(64) })

interface SavedKey {
  provider: AiProvider
  keyCipher: string
  keyHint: string
}

const readKeys = async (db: D1Database, userId: string) =>
  (
    await db
      .prepare(
        `select provider, key_cipher as keyCipher, key_hint as keyHint from user_ai_keys
         where user_id = ? order by provider`,
      )
      .bind(userId)
      .all<SavedKey>()
  ).results

const saveChoice = (db: D1Database, userId: string, provider: AiProvider, model: string) =>
  db
    .prepare(
      `insert into user_ai (user_id, provider, model, updated_at) values (?, ?, ?, ?)
       on conflict (user_id) do update set provider = excluded.provider, model = excluded.model,
         updated_at = excluded.updated_at`,
    )
    .bind(userId, provider, model, Date.now())

async function view(db: D1Database, userId: string): Promise<UserAi> {
  const [keys, choice, shares] = await Promise.all([
    readKeys(db, userId),
    db
      .prepare('select provider, model from user_ai where user_id = ?')
      .bind(userId)
      .first<{ provider: AiProvider; model: string }>(),
    db
      .prepare('select family_id as familyId from ai_shares where user_id = ? order by created_at')
      .bind(userId)
      .all<{ familyId: string }>(),
  ])
  return {
    keys: keys.map(({ provider, keyHint: hint }) => ({ provider, keyHint: hint })),
    /** The model voice commands use; there is always a key for its provider. */
    choice: choice && keys.some((key) => key.provider === choice.provider) ? choice : null,
    sharedFamilyIds: shares.results.map((row) => row.familyId),
  }
}

/** The models each saved key can use; a key that stopped working says so instead. */
async function modelsFor(secret: string, key: SavedKey): Promise<ProviderModels> {
  try {
    const models = await listModels(key.provider, await decryptKey(secret, key.keyCipher))
    return { provider: key.provider, status: 'ok', models }
  } catch (error) {
    if (error instanceof AiKeyError) return { provider: key.provider, status: 'invalid' }
    console.error('Model list failed', error)
    return { provider: key.provider, status: 'unreachable' }
  }
}

/**
 * The user's own AI for voice logging: a key per provider, the model in use, and the families
 * it is shared with. Keys go in once and never come back out; only their last characters are
 * shown.
 */
export const userAiRoutes = new Hono<AppEnv>()
  .get('/', async (c) => c.json(await view(c.env.DB, c.get('user').id)))
  .get('/models', async (c) => {
    const secret = c.env.ENCRYPTION_SECRET
    if (!secret) fail('not_configured')
    const keys = await readKeys(c.env.DB, c.get('user').id)
    return c.json({ providers: await Promise.all(keys.map((key) => modelsFor(secret, key))) })
  })
  // Checks the key, saves it, and on the first key also picks the model to start with.
  .put('/keys/:provider', json(keySchema), async (c) => {
    const secret = c.env.ENCRYPTION_SECRET
    if (!secret) fail('not_configured')
    const provider = providerSchema.safeParse(c.req.param('provider'))
    if (!provider.success) fail('not_found')
    const db = c.env.DB
    const userId = c.get('user').id
    const { apiKey } = c.req.valid('json')
    let models: AiModel[]
    try {
      models = await listModels(provider.data, apiKey)
    } catch (error) {
      if (error instanceof AiKeyError) fail('invalid_key')
      throw error
    }
    const before = await view(db, userId)
    const first = before.choice ? undefined : firstChoice(models)
    await db.batch([
      db
        .prepare(
          `insert into user_ai_keys (user_id, provider, key_cipher, key_hint, updated_at)
           values (?, ?, ?, ?, ?)
           on conflict (user_id, provider) do update set key_cipher = excluded.key_cipher,
             key_hint = excluded.key_hint, updated_at = excluded.updated_at`,
        )
        .bind(userId, provider.data, await encryptKey(secret, apiKey), keyHint(apiKey), Date.now()),
      ...(first ? [saveChoice(db, userId, provider.data, first.id)] : []),
    ])
    return c.json(await view(db, userId))
  })
  // Removing the key in use stops voice commands until another model is picked; removing the
  // last key also ends the shares.
  .delete('/keys/:provider', async (c) => {
    const provider = providerSchema.safeParse(c.req.param('provider'))
    if (!provider.success) fail('not_found')
    const db = c.env.DB
    const userId = c.get('user').id
    await db.batch([
      db
        .prepare('delete from user_ai_keys where user_id = ? and provider = ?')
        .bind(userId, provider.data),
      db
        .prepare('delete from user_ai where user_id = ? and provider = ?')
        .bind(userId, provider.data),
      db
        .prepare(
          `delete from ai_shares where user_id = ?1
           and not exists (select 1 from user_ai_keys where user_id = ?1)`,
        )
        .bind(userId),
    ])
    return c.json(await view(db, userId))
  })
  .put('/', json(chooseModelSchema), async (c) => {
    const db = c.env.DB
    const userId = c.get('user').id
    const { provider, model } = c.req.valid('json')
    const keys = await readKeys(db, userId)
    if (!keys.some((key) => key.provider === provider)) fail('no_key')
    await saveChoice(db, userId, provider, model).run()
    return c.json(await view(db, userId))
  })
  .put('/shares', json(sharesSchema), async (c) => {
    const db = c.env.DB
    const userId = c.get('user').id
    if ((await readKeys(db, userId)).length === 0) fail('not_found')
    const access = await loadAccess(db, userId)
    const { familyIds } = c.req.valid('json')
    if (familyIds.some((id) => !access.has(id))) fail('forbidden')
    const now = Date.now()
    await db.batch([
      db
        .prepare(
          `delete from ai_shares where user_id = ?1
           and family_id not in (select value from json_each(?2))`,
        )
        .bind(userId, JSON.stringify(familyIds)),
      // One statement for any number of families.
      db
        .prepare(
          `insert into ai_shares (family_id, user_id, created_at)
           select value, ?2, ?3 from json_each(?1) where true
           on conflict do nothing`,
        )
        .bind(JSON.stringify(familyIds), userId, now),
    ])
    return c.json(await view(db, userId))
  })

async function familyView(db: D1Database, familyId: string): Promise<FamilyAi> {
  const shared = await sharedAis(db, [familyId])
  const shares = shared.map(({ userId, name, provider, model }) => ({
    userId,
    name,
    provider,
    model,
  }))
  return { inUse: shares[0]?.userId ?? null, shares }
}

/**
 * The AIs members shared with a family, and which one it uses. Owners and admins pick it;
 * keys never leave the server.
 */
export const familyAiRoutes = new Hono<FamilyEnv>()
  .use(familyMember)
  .get('/', async (c) => c.json(await familyView(c.env.DB, c.req.param('familyId') ?? '')))
  .put('/', familyManager, json(chooseSchema), async (c) => {
    const db = c.env.DB
    const familyId = c.req.param('familyId') ?? ''
    const { userId } = c.req.valid('json')
    const current = await familyView(db, familyId)
    if (!current.shares.some((share) => share.userId === userId)) fail('forbidden')
    await db
      .prepare(
        `insert into family_ai (family_id, user_id, updated_by, updated_at) values (?, ?, ?, ?)
         on conflict (family_id) do update set user_id = excluded.user_id,
           updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      )
      .bind(familyId, userId, c.get('user').id, Date.now())
      .run()
    return c.json(await familyView(db, familyId))
  })
