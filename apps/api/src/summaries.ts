import type { Event, PushMessage } from '@lullabo/shared'

import { loadAccess, memberSeesBaby } from './access'
import { type AdapterFor, payingAi, withinDailyLimit } from './agent/budget'
import { recentEvents } from './agent/data'
import { ageOn } from './agent/guide'
import { modelOptionsFor } from './ai/providers'
import { savedAdapter } from './ai/saved-adapter'
import type { Env } from './env'
import { getVapidKeys, removeGone } from './push'
import { localDay, minuteOfDayIn } from './time-zone'
import { MIN_LOGGED_DAYS, WEEK, observe, weekLines } from './tips/observe'
import { readSettings } from './voice/settings'
import { type PushResult, type PushTarget, sendPush } from './web-push'

/** Summaries go out at 21:00 on each device's clock (the cron's quarter hour). */
const SEND_MINUTE = 21 * 60
const WINDOW_MINUTES = 15
/** Devices without a known time zone get China's, as the app's first users are there. */
const DEFAULT_TIME_ZONE = 'Asia/Shanghai'
/** Pushes per run, as for the other reminders. */
const MAX_SENDS = 30
const DAY_MS = 86_400_000

interface Device extends PushTarget {
  userId: string
  timeZone: string | null
}

export interface Totals {
  feeds: number
  bottleMl: number
  breastMinutes: number
  sleepMs: number
  diapers: number
  dirty: number
  maxCelsius: number | null
}

/** What was logged in `events`, added up. A sleep counts on the day it began. */
export function totals(events: readonly Event[]): Totals {
  const sum: Totals = {
    feeds: 0,
    bottleMl: 0,
    breastMinutes: 0,
    sleepMs: 0,
    diapers: 0,
    dirty: 0,
    maxCelsius: null,
  }
  for (const event of events) {
    if (event.deletedAt !== null) continue
    if (event.type === 'feeding') {
      sum.feeds += 1
      if (event.data.kind === 'bottle') sum.bottleMl += event.data.amountMl
      if (event.data.kind === 'breast') {
        for (const segment of event.data.segments) {
          const end = segment.endAt ?? segment.startAt
          sum.breastMinutes += Math.max(0, end - segment.startAt) / 60_000
        }
      }
    }
    if (event.type === 'sleep' && event.endAt !== null) sum.sleepMs += event.endAt - event.startAt
    if (event.type === 'diaper') {
      sum.diapers += 1
      if (event.data.contents !== 'wet') sum.dirty += 1
    }
    if (event.type === 'temperature') {
      sum.maxCelsius = Math.max(sum.maxCelsius ?? 0, event.data.celsius)
    }
  }
  return sum
}

const tenths = (value: number) => Math.round(value * 10) / 10

/** "喂养 8 次（瓶喂 640 毫升）· 睡了 13.5 小时 · 尿布 6 片（便便 2 次）", over `days` days. */
export function totalsLine(sum: Totals, days = 1) {
  const per = (value: number) => tenths(value / days)
  const feeding =
    sum.feeds === 0
      ? ''
      : `喂养 ${per(sum.feeds)} 次${sum.bottleMl > 0 ? `（瓶喂 ${Math.round(sum.bottleMl / days)} 毫升）` : ''}`
  const parts = [
    feeding,
    sum.breastMinutes > 0 ? `亲喂 ${Math.round(sum.breastMinutes / days)} 分钟` : '',
    sum.sleepMs > 0 ? `睡了 ${tenths(sum.sleepMs / 3_600_000 / days)} 小时` : '',
    sum.diapers > 0
      ? `尿布 ${per(sum.diapers)} 片${sum.dirty > 0 ? `（便便 ${per(sum.dirty)} 次）` : ''}`
      : '',
    sum.maxCelsius !== null && sum.maxCelsius >= 38 ? `最高体温 ${sum.maxCelsius}℃` : '',
  ]
  return parts.filter(Boolean).join(' · ')
}

/** The day's summary: "小米粒今天" and what was logged. */
export function dailyMessage(babyId: string, name: string, sum: Totals): PushMessage {
  return {
    title: `${name}今天`,
    body: totalsLine(sum),
    tag: `summary-${babyId}`,
    url: '/stats',
  }
}

/** The week's: the daily average over the days logged, then the AI's observation if any. */
export function weeklyMessage(
  babyId: string,
  name: string,
  sum: Totals,
  loggedDays: number,
  observation: string | null,
): PushMessage {
  const average = `${loggedDays} 天的记录，平均每天：${totalsLine(sum, loggedDays)}`
  return {
    title: `${name}这一周`,
    body: observation ? `${average}\n${observation}` : average,
    tag: `summary-${babyId}`,
    url: observation ? '/tips' : '/stats?view=trends',
  }
}

const isSunday = (now: number, timeZone: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(now) === 'Sun'

/**
 * The week's observation for a baby: the one written today if there is one (the Tips tab
 * shares it), else written now by the AI of a user who may spend it, kept for the day.
 */
async function weekObservation(
  env: Env,
  adapterFor: AdapterFor,
  userId: string,
  baby: { id: string; name: string; familyId: string; birthDate: string },
  events: readonly Event[],
  now: number,
  zone: string,
): Promise<string | null> {
  const day = localDay(now, zone)
  const kept = await env.DB.prepare('select text from observations where baby_id = ? and day = ?')
    .bind(baby.id, day)
    .first<{ text: string }>()
  if (kept) return kept.text
  const { lines, logged } = weekLines(events, now, zone)
  if (logged < MIN_LOGGED_DAYS) return null
  const access = await loadAccess(env.DB, userId)
  const paying = await payingAi(env, adapterFor, userId, access, baby.familyId)
  if (!paying) return null
  if (!(await withinDailyLimit(env.DB, userId, await readSettings(env.DB, userId), now))) {
    return null
  }
  const age = ageOn(baby.birthDate, now, zone)
  const text = await observe(
    paying.adapter,
    modelOptionsFor(paying.ai.ai.provider, paying.ai.ai.model),
    { name: baby.name, age, months: age.totalDays / 30.44 },
    lines,
  )
  if (text) {
    await env.DB.prepare(
      `insert into observations (baby_id, day, text, created_at) values (?, ?, ?, ?)
       on conflict (baby_id, day) do nothing`,
    )
      .bind(baby.id, day, text, now)
      .run()
  }
  return text
}

/**
 * Cron entry point, each quarter hour: for devices where it is now 21:00 to 21:14, sends
 * their users a summary of each baby they see and logged for: on Sundays the week's (with
 * the AI's observation, if the family has an AI), other days the day's. Once a day per
 * user; each turned off on its own.
 */
export async function dispatchSummaries(
  env: Env,
  now: number,
  fetcher?: typeof fetch,
  adapterFor: AdapterFor = savedAdapter,
): Promise<number> {
  const db = env.DB
  const { results: devices } = await db
    .prepare(
      `select endpoint, p256dh, auth, user_id as userId, time_zone as timeZone
       from push_subscriptions`,
    )
    .all<Device>()
  // Each user once, in the zone of a device whose evening it is.
  const zoneOf = new Map<string, string>()
  const due = devices.filter((device) => {
    const zone = device.timeZone ?? DEFAULT_TIME_ZONE
    const minute = minuteOfDayIn(zone)(now)
    if (minute < SEND_MINUTE || minute >= SEND_MINUTE + WINDOW_MINUTES) return false
    if (!zoneOf.has(device.userId)) zoneOf.set(device.userId, zone)
    return true
  })
  if (due.length === 0) return 0

  const { results: settings } = await db
    .prepare(
      `select u.value as userId, coalesce(s.daily, 1) as daily, coalesce(s.weekly, 1) as weekly,
         coalesce(s.sent_on, '') as sentOn
       from json_each(?) u left join summary_settings s on s.user_id = u.value`,
    )
    .bind(JSON.stringify([...zoneOf.keys()]))
    .all<{ userId: string; daily: number; weekly: number; sentOn: string }>()

  const keys = await getVapidKeys(db)
  const sends: Promise<PushResult>[] = []
  const sentTo: PushTarget[] = []
  for (const user of settings) {
    const zone = zoneOf.get(user.userId) ?? DEFAULT_TIME_ZONE
    const day = localDay(now, zone)
    if (user.sentOn === day) continue
    const weekly = isSunday(now, zone) && user.weekly === 1
    if (!weekly && user.daily !== 1) continue
    const targets = due.filter((device) => device.userId === user.userId)
    if (sends.length > 0 && sends.length + targets.length > MAX_SENDS) break
    // Claimed before writing or sending, so overlapping runs never send the same day twice.
    // oxlint-disable-next-line no-await-in-loop -- one user at a time, within the run's share
    const claim = await db
      .prepare(
        `insert into summary_settings (user_id, sent_on, updated_at) values (?1, ?2, ?3)
         on conflict (user_id) do update set sent_on = excluded.sent_on
         where summary_settings.sent_on <> excluded.sent_on`,
      )
      .bind(user.userId, day, now)
      .run()
    if (claim.meta.changes !== 1) continue
    // oxlint-disable-next-line no-await-in-loop -- as above
    const { results: babies } = await db
      .prepare(
        `select b.id, b.name, b.family_id as familyId, b.birth_date as birthDate
         from babies b join memberships m on m.family_id = b.family_id
         where m.user_id = ?1 and b.deleted_at is null and b.archived_at is null
           and ${memberSeesBaby('b.id')}`,
      )
      .bind(user.userId)
      .all<{ id: string; name: string; familyId: string; birthDate: string }>()
    for (const baby of babies) {
      // oxlint-disable-next-line no-await-in-loop -- a few babies a user
      const events = await recentEvents(db, [baby.id], now - (WEEK + 2) * DAY_MS, null, 2000)
      let message: PushMessage | null = null
      if (weekly) {
        const week = events.filter((event) => {
          const on = localDay(event.startAt, zone)
          return on < day && on >= localDay(now - WEEK * DAY_MS, zone)
        })
        const logged = new Set(week.map((event) => localDay(event.startAt, zone))).size
        if (logged > 0) {
          // oxlint-disable-next-line no-await-in-loop -- one AI call per baby at most
          const note = await weekObservation(env, adapterFor, user.userId, baby, events, now, zone)
          message = weeklyMessage(baby.id, baby.name, totals(week), logged, note)
        }
      } else {
        const today = events.filter((event) => localDay(event.startAt, zone) === day)
        if (today.length > 0) message = dailyMessage(baby.id, baby.name, totals(today))
      }
      if (!message?.body) continue
      for (const target of targets) {
        sentTo.push(target)
        sends.push(sendPush(target, message, keys, env.BETTER_AUTH_URL, now, fetcher))
      }
    }
  }
  const results = await Promise.all(sends)
  await removeGone(db, sentTo, results)
  return results.filter((result) => result === 'sent').length
}
