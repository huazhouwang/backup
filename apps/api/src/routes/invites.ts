import {
  type FamilyRole,
  INVITE_TTL_MS,
  type Invite,
  type InvitePreview,
  type InviteStatus,
  base64UrlEncode,
  canManageMember,
  createInviteRequestSchema,
} from '@lullabo/shared'
import { Hono } from 'hono'

import {
  type FamilyEnv,
  babiesInFamily,
  familyManager,
  familyMember,
  parseStringList,
} from '../access'
import { fail, json } from '../http'
import type { AppEnv } from '../types'

type InviteRole = Exclude<FamilyRole, 'owner'>

interface InviteRow {
  code: string
  familyId: string
  role: InviteRole
  babyIds: string | null
  createdAt: number
  expiresAt: number
  usedAt: number | null
  revokedAt: number | null
}

const INVITE_COLUMNS = `i.code, i.family_id as familyId, i.role, i.baby_ids as babyIds,
  i.created_at as createdAt, i.expires_at as expiresAt, i.used_at as usedAt,
  i.revoked_at as revokedAt`

/** 128 random bits, URL-safe: the code is the only secret an invite link carries. */
function newInviteCode(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)))
}

function statusOf(row: InviteRow, now: number): InviteStatus {
  if (row.revokedAt !== null) return 'revoked'
  if (row.usedAt !== null) return 'used'
  return row.expiresAt <= now ? 'expired' : 'active'
}

function toInvite(row: InviteRow): Invite {
  return {
    code: row.code,
    familyId: row.familyId,
    role: row.role,
    babyIds: row.babyIds === null ? null : parseStringList(row.babyIds),
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  }
}

/** Mounted at /families/:familyId/invites; managers create, list and revoke invites. */
export const familyInviteRoutes = new Hono<FamilyEnv>()
  .use(familyMember)
  .post('/', json(createInviteRequestSchema), async (c) => {
    const db = c.env.DB
    const familyId = c.req.param('familyId') ?? ''
    const { role, babyIds } = c.req.valid('json')
    // Inviting someone is like managing a member who holds the invited role.
    if (!canManageMember(c.var.role, role, role)) fail('forbidden')
    if (babyIds && !(await babiesInFamily(db, familyId, babyIds))) fail('invalid')

    const now = Date.now()
    const invite: Invite = {
      code: newInviteCode(),
      familyId,
      role,
      babyIds: babyIds ? [...new Set(babyIds)] : null,
      createdAt: now,
      expiresAt: now + INVITE_TTL_MS,
    }
    await db
      .prepare(
        `insert into invites (code, family_id, role, baby_ids, created_by, created_at, expires_at)
         values (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        invite.code,
        familyId,
        role,
        invite.babyIds && JSON.stringify(invite.babyIds),
        c.get('user').id,
        now,
        invite.expiresAt,
      )
      .run()
    return c.json(invite, 201)
  })
  .get('/', familyManager, async (c) => {
    const db = c.env.DB
    const familyId = c.req.param('familyId') ?? ''
    const { results } = await db
      .prepare(
        `select ${INVITE_COLUMNS} from invites i
         where i.family_id = ? and i.used_at is null and i.revoked_at is null and i.expires_at > ?
         order by i.created_at desc`,
      )
      .bind(familyId, Date.now())
      .all<InviteRow>()
    return c.json(results.map(toInvite))
  })
  .delete('/:code', familyManager, async (c) => {
    const db = c.env.DB
    const familyId = c.req.param('familyId') ?? ''
    await db
      .prepare(
        'update invites set revoked_at = ? where code = ? and family_id = ? and revoked_at is null',
      )
      .bind(Date.now(), c.req.param('code'), familyId)
      .run()
    return c.body(null, 204)
  })

/** Public preview, so the join page can show who is inviting before sign-in. */
export const invitePreviewRoutes = new Hono<AppEnv>().get('/:code', async (c) => {
  const row = await c.env.DB.prepare(
    `select ${INVITE_COLUMNS}, f.name as familyName, coalesce(u.name, '') as inviterName,
       (select json_group_array(b.name) from json_each(i.baby_ids) j
        join babies b on b.id = j.value and b.family_id = i.family_id
        where b.deleted_at is null) as babyNames
     from invites i join families f on f.id = i.family_id
     left join user u on u.id = i.created_by
     where i.code = ?`,
  )
    .bind(c.req.param('code'))
    .first<InviteRow & { familyName: string; inviterName: string; babyNames: string }>()
  if (!row) fail('not_found')
  const preview: InvitePreview = {
    familyName: row.familyName,
    inviterName: row.inviterName,
    role: row.role,
    babyNames: row.babyIds === null ? null : parseStringList(row.babyNames),
    status: statusOf(row, Date.now()),
  }
  return c.json(preview)
})

/** POST /invites/:code/accept: joins the family; each invite works once. */
export const inviteAcceptRoutes = new Hono<AppEnv>().post('/:code/accept', async (c) => {
  const db = c.env.DB
  const code = c.req.param('code')
  const userId = c.get('user').id
  const now = Date.now()

  const row = await db
    .prepare(
      `select ${INVITE_COLUMNS},
         exists (select 1 from memberships m where m.family_id = i.family_id and m.user_id = ?)
           as isMember
       from invites i where i.code = ?`,
    )
    .bind(userId, code)
    .first<InviteRow & { isMember: number }>()
  if (!row) fail('not_found')
  if (row.isMember) fail('already_member', { familyId: row.familyId })
  const status = statusOf(row, now)
  if (status !== 'active') fail(status)

  // Claim the invite and create the membership in one transaction. The conditional update
  // makes a concurrent second accept claim nothing, so its inserts select no rows.
  const [claim] = await db.batch([
    db
      .prepare(
        `update invites set used_by = ?1, used_at = ?2
         where code = ?3 and used_at is null and revoked_at is null and expires_at > ?2
           and not exists (select 1 from memberships m
                           where m.family_id = invites.family_id and m.user_id = ?1)`,
      )
      .bind(userId, now, code),
    db
      .prepare(
        `insert into memberships (family_id, user_id, role, baby_scope, created_at)
         select family_id, ?1, role, case when baby_ids is null then 'all' else 'selected' end, ?2
         from invites where code = ?3 and used_by = ?1 and used_at = ?2`,
      )
      .bind(userId, now, code),
    // Babies deleted since the invite was created are skipped.
    db
      .prepare(
        `insert or ignore into membership_babies (family_id, user_id, baby_id)
         select i.family_id, ?1, b.id from invites i, json_each(i.baby_ids) j
         join babies b on b.id = j.value and b.family_id = i.family_id
         where i.code = ?3 and i.used_by = ?1 and i.used_at = ?2`,
      )
      .bind(userId, now, code),
  ])
  if (!claim?.meta.changes) fail('used')
  return c.json({ familyId: row.familyId }, 200)
})
