import {
  type Reminder,
  type SummarySettings,
  summarySettingsSchema,
  type VaccineReminder,
  vaccineReminderSchema,
  pushSubscriptionSchema,
  pushUnsubscribeSchema,
  reminderSchema,
} from '@lullabo/shared'
import { Hono } from 'hono'

import { canSeeBaby } from '../access'
import { fail, json } from '../http'
import { getVapidKeys, notifyUser } from '../push'
import type { AppEnv } from '../types'
import { timeZoneSchema } from '../validation'

/** Push subscriptions of the signed-in user's devices. */
export const pushRoutes = new Hono<AppEnv>()
  .get('/key', async (c) => c.json({ publicKey: (await getVapidKeys(c.env.DB)).publicKey }))
  .put('/subscription', json(pushSubscriptionSchema), async (c) => {
    const { endpoint, keys, timeZone } = c.req.valid('json')
    const zone = timeZoneSchema.safeParse(timeZone).success ? (timeZone ?? null) : null
    // A browser belongs to whoever signed in on it last.
    await c.env.DB.prepare(
      `insert into push_subscriptions (endpoint, user_id, p256dh, auth, time_zone, created_at)
       values (?, ?, ?, ?, ?, ?)
       on conflict (endpoint) do update set
         user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
         time_zone = coalesce(excluded.time_zone, push_subscriptions.time_zone)`,
    )
      .bind(endpoint, c.get('user').id, keys.p256dh, keys.auth, zone, Date.now())
      .run()
    return c.body(null, 204)
  })
  .delete('/subscription', json(pushUnsubscribeSchema), async (c) => {
    const { endpoint } = c.req.valid('json')
    await c.env.DB.prepare('delete from push_subscriptions where endpoint = ? and user_id = ?')
      .bind(endpoint, c.get('user').id)
      .run()
    return c.body(null, 204)
  })
  .post('/test', async (c) => {
    const results = await notifyUser(
      c.env,
      c.get('user').id,
      { title: 'Lullabo', body: '通知已开启，提醒会这样出现。', tag: 'test', url: '/settings' },
      Date.now(),
    )
    return c.json({ sent: results.filter((result) => result === 'sent').length })
  })

/** The signed-in user's reminders; each user picks their own. */
export const reminderRoutes = new Hono<AppEnv>()
  // Vaccination reminders are on for every baby until turned off.
  .get('/summaries', async (c) => {
    const row = await c.env.DB.prepare(
      'select daily, weekly from summary_settings where user_id = ?',
    )
      .bind(c.get('user').id)
      .first<{ daily: number; weekly: number }>()
    return c.json({
      daily: row ? row.daily === 1 : true,
      weekly: row ? row.weekly === 1 : true,
    } satisfies SummarySettings)
  })
  .put('/summaries', json(summarySettingsSchema), async (c) => {
    const { daily, weekly } = c.req.valid('json')
    await c.env.DB.prepare(
      `insert into summary_settings (user_id, daily, weekly, updated_at) values (?, ?, ?, ?)
       on conflict (user_id) do update set
         daily = excluded.daily, weekly = excluded.weekly, updated_at = excluded.updated_at`,
    )
      .bind(c.get('user').id, daily ? 1 : 0, weekly ? 1 : 0, Date.now())
      .run()
    return c.json({ daily, weekly } satisfies SummarySettings)
  })
  .get('/vaccines', async (c) => {
    const { results } = await c.env.DB.prepare(
      'select baby_id as babyId, enabled from vaccine_reminders where user_id = ?',
    )
      .bind(c.get('user').id)
      .all<{ babyId: string; enabled: number }>()
    const reminders: VaccineReminder[] = results.map((row) => ({
      babyId: row.babyId,
      enabled: row.enabled === 1,
    }))
    return c.json(reminders)
  })
  .put('/vaccines', json(vaccineReminderSchema), async (c) => {
    const { babyId, enabled } = c.req.valid('json')
    const userId = c.get('user').id
    if (!(await canSeeBaby(c.env.DB, userId, babyId))) fail('forbidden')
    await c.env.DB.prepare(
      `insert into vaccine_reminders (user_id, baby_id, enabled, updated_at) values (?, ?, ?, ?)
       on conflict (user_id, baby_id) do update set
         enabled = excluded.enabled, updated_at = excluded.updated_at`,
    )
      .bind(userId, babyId, enabled ? 1 : 0, Date.now())
      .run()
    return c.json({ babyId, enabled })
  })
  .get('/', async (c) => {
    const { results } = await c.env.DB.prepare(
      `select baby_id as babyId, kind, interval_minutes as intervalMinutes, enabled
       from reminders where user_id = ?`,
    )
      .bind(c.get('user').id)
      .all<Omit<Reminder, 'enabled'> & { enabled: number }>()
    const reminders: Reminder[] = results.map((row) => ({
      babyId: row.babyId,
      kind: row.kind,
      intervalMinutes: row.intervalMinutes,
      enabled: row.enabled === 1,
    }))
    return c.json(reminders)
  })
  .put('/', json(reminderSchema), async (c) => {
    const reminder = c.req.valid('json')
    const { babyId, kind, intervalMinutes, enabled } = reminder
    const userId = c.get('user').id
    if (!(await canSeeBaby(c.env.DB, userId, babyId))) fail('forbidden')
    const now = Date.now()
    // A gap that is already longer than the interval doesn't notify right away; the next one does.
    await c.env.DB.prepare(
      `insert into reminders (user_id, baby_id, kind, interval_minutes, enabled, fired_for, updated_at)
       values (?1, ?2, ?3, ?4, ?5, (
         select case when max(e.start_at) + ?4 * 60000 <= ?6 then max(e.start_at) end
         from events e where e.baby_id = ?2 and e.type = ?3 and e.deleted_at is null), ?6)
       on conflict (user_id, baby_id, kind) do update set
         interval_minutes = excluded.interval_minutes, enabled = excluded.enabled,
         fired_for = max(coalesce(reminders.fired_for, 0), coalesce(excluded.fired_for, 0)),
         updated_at = excluded.updated_at`,
    )
      .bind(userId, babyId, kind, intervalMinutes, enabled ? 1 : 0, now)
      .run()
    return c.json(reminder)
  })
