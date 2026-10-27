import {
  type Baby,
  type Event,
  type FamilyRole,
  type FamilySummary,
  type PushRejectReason,
  inBabyScope,
  isManager,
} from '@lullabo/shared'
import { createMiddleware } from 'hono/factory'

import { fail } from './http'
import type { AppEnv } from './types'

export interface FamilyAccess {
  id: string
  name: string
  role: FamilyRole
  /** null: every baby of the family. */
  babyIds: ReadonlySet<string> | null
  alias: string | null
  memberCount: number
}

export type Access = ReadonlyMap<string, FamilyAccess>

interface AccessRow {
  id: string
  name: string
  role: FamilyRole
  babyScope: 'all' | 'selected'
  babyIds: string
  alias: string | null
  memberCount: number
}

/** Parses a JSON array of strings from SQLite (e.g. `json_group_array`), skipping non-strings. */
export function parseStringList(json: string): string[] {
  const value: unknown = JSON.parse(json)
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
}

/** JSON array of the babies a membership `m` is scoped to (empty for every baby). */
export const MEMBER_BABY_IDS = `(select json_group_array(mb.baby_id) from membership_babies mb
  where mb.family_id = m.family_id and mb.user_id = m.user_id)`

/** SQL condition: membership `m` can see the baby with id `babyIdColumn`. */
export const memberSeesBaby = (babyIdColumn: string) =>
  `(m.baby_scope = 'all' or exists (select 1 from membership_babies mb
    where mb.family_id = m.family_id and mb.user_id = m.user_id and mb.baby_id = ${babyIdColumn}))`

/** Whether the user can see the baby: a member of its family, within their baby scope. */
export async function canSeeBaby(db: D1Database, userId: string, babyId: string) {
  const row = await db
    .prepare(
      `select 1 from babies b join memberships m on m.family_id = b.family_id and m.user_id = ?1
       where b.id = ?2 and b.deleted_at is null and ${memberSeesBaby('b.id')}`,
    )
    .bind(userId, babyId)
    .first()
  return row !== null
}

/** Everything the user can access, in one query. */
export async function loadAccess(db: D1Database, userId: string): Promise<Access> {
  const { results } = await db
    .prepare(
      `select f.id, f.name, m.role, m.baby_scope as babyScope, ${MEMBER_BABY_IDS} as babyIds,
         m.alias, (select count(*) from memberships o where o.family_id = m.family_id) as memberCount
       from memberships m join families f on f.id = m.family_id
       where m.user_id = ? order by m.created_at`,
    )
    .bind(userId)
    .all<AccessRow>()
  return new Map(
    results.map((row) => [
      row.id,
      {
        id: row.id,
        name: row.name,
        role: row.role,
        babyIds: row.babyScope === 'all' ? null : new Set(parseStringList(row.babyIds)),
        alias: row.alias,
        memberCount: row.memberCount,
      },
    ]),
  )
}

export function toSummaries(access: Access): FamilySummary[] {
  return [...access.values()].map((family) => ({
    id: family.id,
    name: family.name,
    role: family.role,
    babyIds: family.babyIds ? [...family.babyIds] : null,
    alias: family.alias,
    memberCount: family.memberCount,
  }))
}

/** Read filters for pull: whole families, plus individual babies in scoped families. */
export function readScope(access: Access): { familyIds: string[]; babyIds: string[] } {
  const familyIds: string[] = []
  const babyIds: string[] = []
  for (const family of access.values()) {
    if (family.babyIds === null) familyIds.push(family.id)
    else babyIds.push(...family.babyIds)
  }
  return { familyIds, babyIds }
}

const canSee = (family: FamilyAccess, babyId: string) => inBabyScope(family.babyIds, babyId)

export interface ExistingBaby {
  familyId: string | null
}

/** Babies are managed by owners and admins (within their baby scope). */
export function checkBabyWrite(
  access: Access,
  baby: Baby,
  existing: ExistingBaby | undefined,
): PushRejectReason | null {
  const family = baby.familyId ? access.get(baby.familyId) : undefined
  if (!family) return 'forbidden'
  if (existing && existing.familyId !== baby.familyId) return 'family_mismatch'
  if (!isManager(family.role)) return 'forbidden'
  // Scoped admins can edit their babies but not add new ones.
  if (!canSee(family, baby.id)) return 'forbidden'
  return null
}

export interface ExistingEvent {
  familyId: string | null
  babyId: string
  createdBy: string | null
}

/**
 * Viewers cannot write; caregivers create events and change only their own; everyone is
 * limited to the babies in their scope (including the baby an event currently belongs to).
 */
export function checkEventWrite(
  access: Access,
  event: Event,
  existing: ExistingEvent | undefined,
  userId: string,
): PushRejectReason | null {
  const family = event.familyId ? access.get(event.familyId) : undefined
  if (!family) return 'forbidden'
  if (existing && existing.familyId !== event.familyId) return 'family_mismatch'
  if (family.role === 'viewer') return 'forbidden'
  if (!canSee(family, event.babyId)) return 'forbidden'
  if (existing && !canSee(family, existing.babyId)) return 'forbidden'
  if (family.role === 'caregiver' && existing && existing.createdBy !== userId) return 'forbidden'
  return null
}

/** The user's role in the family, or null when they are not a member. */
export async function roleOf(
  db: D1Database,
  familyId: string,
  userId: string,
): Promise<FamilyRole | null> {
  const row = await db
    .prepare('select role from memberships where family_id = ? and user_id = ?')
    .bind(familyId, userId)
    .first<{ role: FamilyRole }>()
  return row?.role ?? null
}

/** Whether every id names a baby of the family (duplicates allowed). */
export async function babiesInFamily(
  db: D1Database,
  familyId: string,
  babyIds: readonly string[],
): Promise<boolean> {
  const row = await db
    .prepare(
      'select count(*) as n from babies where family_id = ? and id in (select value from json_each(?))',
    )
    .bind(familyId, JSON.stringify(babyIds))
    .first<{ n: number }>()
  return row?.n === new Set(babyIds).size
}

export type FamilyEnv = AppEnv & { Variables: { role: FamilyRole } }

/** For routes under /families/:familyId: members only, with their role in `c.var.role`. */
export const familyMember = createMiddleware<FamilyEnv>(async (c, next) => {
  const familyId = c.req.param('familyId')
  const role = familyId ? await roleOf(c.env.DB, familyId, c.get('user').id) : null
  if (!role) fail('forbidden')
  c.set('role', role)
  await next()
})

/** After `familyMember`: owners and admins only. */
export const familyManager = createMiddleware<FamilyEnv>(async (c, next) => {
  if (!isManager(c.get('role'))) fail('forbidden')
  await next()
})
