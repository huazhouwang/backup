import type { Access } from '../access'
import type { AiProvider } from '../ai/providers'

// Whose AI key voice logging spends. A user's own key works in every family they can record
// for. Without one, a key another member shared with a family works only in that family, so
// nobody's key is spent outside the family they shared it with.

export interface SavedAi {
  provider: AiProvider
  model: string
  keyCipher: string
  keyHint: string
}

export interface SharedAi extends SavedAi {
  familyId: string
  userId: string
  name: string
}

/** The model the user picked, with their key for its provider. */
export async function readUserAi(db: D1Database, userId: string) {
  return db
    .prepare(
      `select a.provider, a.model, k.key_cipher as keyCipher, k.key_hint as keyHint
       from user_ai a
       join user_ai_keys k on k.user_id = a.user_id and k.provider = a.provider
       where a.user_id = ?`,
    )
    .bind(userId)
    .first<SavedAi>()
}

/** Every AI shared with the families, by members still in them; each family's in use first. */
export async function sharedAis(db: D1Database, familyIds: string[]) {
  if (familyIds.length === 0) return []
  const { results } = await db
    .prepare(
      `select s.family_id as familyId, s.user_id as userId, u.name, a.provider, a.model,
         k.key_cipher as keyCipher, k.key_hint as keyHint
       from ai_shares s
       join user_ai a on a.user_id = s.user_id
       join user_ai_keys k on k.user_id = a.user_id and k.provider = a.provider
       join memberships m on m.family_id = s.family_id and m.user_id = s.user_id
       join user u on u.id = s.user_id
       left join family_ai f on f.family_id = s.family_id
       where s.family_id in (select value from json_each(?))
       order by coalesce(f.user_id = s.user_id, 0) desc, s.created_at`,
    )
    .bind(JSON.stringify(familyIds))
    .all<SharedAi>()
  return results
}

/** The AI each family uses: the one its managers picked, else the earliest shared. */
export async function familyAis(db: D1Database, familyIds: string[]) {
  const inUse = new Map<string, SharedAi>()
  for (const shared of await sharedAis(db, familyIds)) {
    if (!inUse.has(shared.familyId)) inUse.set(shared.familyId, shared)
  }
  return inUse
}

export type UserAiChoice =
  | { kind: 'own'; ai: SavedAi; familyIds: string[] }
  | { kind: 'shared'; ai: SharedAi; familyIds: string[] }
  | null

/**
 * The key a user's voice commands spend and the families it may record for: their own key
 * and every family they can record in, else the first such family (in the order they
 * joined) that has an AI shared with it, and only that family.
 */
export async function aiForUser(
  db: D1Database,
  userId: string,
  access: Access,
): Promise<UserAiChoice> {
  const recording = [...access.values()]
    .filter((family) => family.role !== 'viewer')
    .map((family) => family.id)
  const own = await readUserAi(db, userId)
  if (own) return { kind: 'own', ai: own, familyIds: recording }
  const inUse = await familyAis(db, recording)
  const familyId = recording.find((id) => inUse.has(id))
  const ai = familyId ? inUse.get(familyId) : undefined
  if (!familyId || !ai) return null
  return { kind: 'shared', ai, familyIds: [familyId] }
}
