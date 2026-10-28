import {
  type FamilyMember,
  type FamilySummary,
  canManageMember,
  createFamilyRequestSchema,
  familyAliasRequestSchema,
  newId,
  renameFamilyRequestSchema,
  transferOwnershipRequestSchema,
  updateMemberRequestSchema,
} from '@lullabo/shared'
import { Hono } from 'hono'

import {
  MEMBER_BABY_IDS,
  babiesInFamily,
  familyManager,
  familyMember,
  loadAccess,
  parseStringList,
  roleOf,
  toSummaries,
} from '../access'
import { deleteFamilyStatements } from '../db/cascade'
import { fail, json } from '../http'
import type { AppEnv } from '../types'

export const familyRoutes = new Hono<AppEnv>()
  .get('/', async (c) => c.json(toSummaries(await loadAccess(c.env.DB, c.get('user').id))))
  .post('/', json(createFamilyRequestSchema), async (c) => {
    const { name } = c.req.valid('json')
    const userId = c.get('user').id
    const now = Date.now()
    const family: FamilySummary = {
      id: newId(now),
      name,
      role: 'owner',
      babyIds: null,
      alias: null,
      memberCount: 1,
    }
    await c.env.DB.batch([
      c.env.DB.prepare(
        'insert into families (id, name, created_by, created_at, updated_at) values (?, ?, ?, ?, ?)',
      ).bind(family.id, family.name, userId, now, now),
      c.env.DB.prepare(
        "insert into memberships (family_id, user_id, role, created_at) values (?, ?, 'owner', ?)",
      ).bind(family.id, userId, now),
    ])
    return c.json(family, 201)
  })
  .patch('/:familyId', familyMember, familyManager, json(renameFamilyRequestSchema), async (c) => {
    await c.env.DB.prepare('update families set name = ?, updated_at = ? where id = ?')
      .bind(c.req.valid('json').name, Date.now(), c.req.param('familyId'))
      .run()
    return c.body(null, 204)
  })
  .put('/:familyId/alias', familyMember, json(familyAliasRequestSchema), async (c) => {
    await c.env.DB.prepare('update memberships set alias = ? where family_id = ? and user_id = ?')
      .bind(c.req.valid('json').alias, c.req.param('familyId'), c.get('user').id)
      .run()
    return c.body(null, 204)
  })
  /**
   * Deletes the family with all its babies and records for everyone; owner only. Members'
   * devices drop the data on their next pull, when the family is gone from their access list.
   */
  .delete('/:familyId', familyMember, async (c) => {
    if (c.var.role !== 'owner') fail('forbidden')
    const db = c.env.DB
    const familyId = c.req.param('familyId')
    await db.batch(deleteFamilyStatements(db, familyId))
    return c.body(null, 204)
  })
  .get('/:familyId/members', familyMember, async (c) => {
    const familyId = c.req.param('familyId')
    const { results } = await c.env.DB.prepare(
      `select m.user_id as userId, u.name, u.image, m.role, m.baby_scope as babyScope,
         ${MEMBER_BABY_IDS} as babyIds
       from memberships m join user u on u.id = m.user_id
       where m.family_id = ? order by m.created_at`,
    )
      .bind(familyId)
      .all<Omit<FamilyMember, 'babyIds'> & { babyScope: 'all' | 'selected'; babyIds: string }>()
    const members: FamilyMember[] = results.map((row) => ({
      userId: row.userId,
      name: row.name,
      image: row.image,
      role: row.role,
      babyIds: row.babyScope === 'all' ? null : parseStringList(row.babyIds),
    }))
    return c.json(members)
  })
  .patch('/:familyId/members/:userId', familyMember, json(updateMemberRequestSchema), async (c) => {
    const db = c.env.DB
    const familyId = c.req.param('familyId')
    const targetId = c.req.param('userId')
    const { role, babyIds } = c.req.valid('json')
    const target = await roleOf(db, familyId, targetId)
    if (!target || !canManageMember(c.var.role, target, role)) fail('forbidden')
    // Only babies of this family can be granted.
    if (babyIds && !(await babiesInFamily(db, familyId, babyIds))) fail('invalid')

    const statements: D1PreparedStatement[] = []
    if (role) {
      statements.push(
        db
          .prepare('update memberships set role = ? where family_id = ? and user_id = ?')
          .bind(role, familyId, targetId),
      )
    }
    if (babyIds !== undefined) {
      statements.push(
        db
          .prepare('update memberships set baby_scope = ? where family_id = ? and user_id = ?')
          .bind(babyIds === null ? 'all' : 'selected', familyId, targetId),
        db
          .prepare('delete from membership_babies where family_id = ? and user_id = ?')
          .bind(familyId, targetId),
      )
      if (babyIds?.length) {
        statements.push(
          db
            .prepare(
              `insert into membership_babies (family_id, user_id, baby_id)
             select ?, ?, value from json_each(?)`,
            )
            .bind(familyId, targetId, JSON.stringify([...new Set(babyIds)])),
        )
      }
    }
    await db.batch(statements)
    return c.body(null, 204)
  })
  .delete('/:familyId/members/:userId', familyMember, async (c) => {
    const db = c.env.DB
    const familyId = c.req.param('familyId')
    const targetId = c.req.param('userId')
    const target = await roleOf(db, familyId, targetId)
    const leaving = targetId === c.get('user').id && target !== null && target !== 'owner'
    if (!target || !(leaving || canManageMember(c.var.role, target))) fail('forbidden')
    await db.batch([
      db
        .prepare('delete from membership_babies where family_id = ? and user_id = ?')
        .bind(familyId, targetId),
      db
        .prepare('delete from memberships where family_id = ? and user_id = ?')
        .bind(familyId, targetId),
      // Their AI is no longer shared with a family they left.
      db
        .prepare('delete from ai_shares where family_id = ? and user_id = ?')
        .bind(familyId, targetId),
      // Links handed out by someone who left should not keep letting people in.
      db
        .prepare(
          'update invites set revoked_at = ? where family_id = ? and created_by = ? and used_at is null and revoked_at is null',
        )
        .bind(Date.now(), familyId, targetId),
    ])
    return c.body(null, 204)
  })
  .post('/:familyId/transfer', familyMember, json(transferOwnershipRequestSchema), async (c) => {
    const db = c.env.DB
    const familyId = c.req.param('familyId')
    const userId = c.get('user').id
    const next = c.req.valid('json').userId
    if (c.var.role !== 'owner' || next === userId || !(await roleOf(db, familyId, next))) {
      fail('forbidden')
    }
    // The new owner sees every baby; the previous owner stays on as an admin.
    await db.batch([
      db
        .prepare(
          "update memberships set role = 'owner', baby_scope = 'all' where family_id = ? and user_id = ?",
        )
        .bind(familyId, next),
      db
        .prepare('delete from membership_babies where family_id = ? and user_id = ?')
        .bind(familyId, next),
      db
        .prepare("update memberships set role = 'admin' where family_id = ? and user_id = ?")
        .bind(familyId, userId),
    ])
    return c.body(null, 204)
  })
