import { threadRange } from '../agent/threads'

// What deleting a family or an account removes, as statements for one db.batch: D1 runs a
// batch as one transaction.

/** Deletes the family with all its babies and records, for everyone in it. */
export function deleteFamilyStatements(db: D1Database, familyId: string): D1PreparedStatement[] {
  return [
    db
      .prepare('delete from reminders where baby_id in (select id from babies where family_id = ?)')
      .bind(familyId),
    db
      .prepare(
        'delete from vaccine_reminders where baby_id in (select id from babies where family_id = ?)',
      )
      .bind(familyId),
    // Keyed by baby with no foreign key, so nothing else removes them.
    db
      .prepare(
        'delete from observations where baby_id in (select id from babies where family_id = ?)',
      )
      .bind(familyId),
    db.prepare('delete from events where family_id = ?').bind(familyId),
    db.prepare('delete from membership_babies where family_id = ?').bind(familyId),
    db.prepare('delete from invites where family_id = ?').bind(familyId),
    db.prepare('delete from memberships where family_id = ?').bind(familyId),
    db.prepare('delete from babies where family_id = ?').bind(familyId),
    db.prepare('delete from families where id = ?').bind(familyId),
  ]
}

/**
 * Deletes the account and its data. Families the user shares keep their data; if the user
 * owned one, the longest-standing other member becomes the owner.
 */
export function deleteAccountStatements(db: D1Database, userId: string): D1PreparedStatement[] {
  const threads = threadRange(userId)

  // Families where the user is the only member: everything in them goes.
  const soleFamilies = `select m.family_id from memberships m where m.user_id = ?1
    and not exists (select 1 from memberships o where o.family_id = m.family_id and o.user_id <> ?1)`

  return [
    db.prepare(`delete from events where family_id in (${soleFamilies})`).bind(userId),
    db
      .prepare(
        `delete from observations where baby_id in
           (select id from babies where family_id in (${soleFamilies}))`,
      )
      .bind(userId),
    db.prepare(`delete from babies where family_id in (${soleFamilies})`).bind(userId),
    db.prepare(`delete from families where id in (${soleFamilies})`).bind(userId),
    // Shared families the user owned: promote the longest-standing other member.
    db
      .prepare(
        `update memberships set role = 'owner', baby_scope = 'all'
         where (family_id, user_id) in (
           select o.family_id, (select o2.user_id from memberships o2
               where o2.family_id = o.family_id and o2.user_id <> ?1
               order by o2.created_at, o2.user_id limit 1)
           from memberships o where o.user_id = ?1 and o.role = 'owner'
         )`,
      )
      .bind(userId),
    // Owners see every baby, so a promoted member's baby list no longer applies.
    db
      .prepare(
        `delete from membership_babies where user_id = ?1 or (family_id, user_id) in (
           select o.family_id, o.user_id from memberships o
           where o.role = 'owner' and o.user_id <> ?1
             and o.family_id in (select family_id from memberships where user_id = ?1)
         )`,
      )
      .bind(userId),
    db
      .prepare(
        'update invites set revoked_at = ?2 where created_by = ?1 and used_at is null and revoked_at is null',
      )
      .bind(userId, Date.now()),
    db.prepare('delete from memberships where user_id = ?').bind(userId),
    db.prepare('delete from reminders where user_id = ?').bind(userId),
    db.prepare('delete from vaccine_reminders where user_id = ?').bind(userId),
    db.prepare('delete from summary_settings where user_id = ?').bind(userId),
    db.prepare('delete from push_subscriptions where user_id = ?').bind(userId),
    db.prepare('delete from voice_tokens where user_id = ?').bind(userId),
    // Their conversations with the voice agent, current and earlier ones.
    ...['voice_ops', 'chat_interrupts', 'chat_runs', 'chat_threads'].map((table) =>
      db
        .prepare(`delete from ${table} where thread_id >= ? and thread_id < ?`)
        .bind(threads.from, threads.to),
    ),
    db.prepare('delete from voice_settings where user_id = ?').bind(userId),
    db.prepare('delete from ai_shares where user_id = ?').bind(userId),
    db.prepare('delete from user_ai where user_id = ?').bind(userId),
    db.prepare('delete from user_ai_keys where user_id = ?').bind(userId),
    db.prepare('delete from session where user_id = ?').bind(userId),
    db.prepare('delete from account where user_id = ?').bind(userId),
    db.prepare('delete from passkey where user_id = ?').bind(userId),
    db.prepare('delete from user where id = ?').bind(userId),
  ]
}
