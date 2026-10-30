import {
  type PushMessage,
  type VaccineNotice,
  noChoices,
  vaccineNotices,
  vaccinePlan,
  vaccinePlanSchema,
  vaccinationDataSchema,
} from '@lullabo/shared'

import { memberSeesBaby } from './access'
import type { Env } from './env'
import { getVapidKeys, removeGone } from './push'
import { localDay, minuteOfDayIn } from './time-zone'
import { type PushResult, type PushTarget, sendPush } from './web-push'

/** Vaccination reminders go out at 9:00 on each device's clock (the cron's quarter hour). */
const SEND_MINUTE = 9 * 60
const WINDOW_MINUTES = 15
/** Devices without a known time zone get China's, as the app's first users are there. */
const DEFAULT_TIME_ZONE = 'Asia/Shanghai'
/** Pushes per run, as for the other reminders. */
const MAX_SENDS = 30

interface Device extends PushTarget {
  userId: string
  timeZone: string | null
}

interface BabyRow {
  userId: string
  babyId: string
  name: string
  birthDate: string
  sex: 'female' | 'male' | 'unspecified'
  vaccinePlan: string | null
}

/** "百白破疫苗 第 2 剂、脊灰灭活疫苗 第 1 剂", three at most. */
function doseList(notice: VaccineNotice) {
  const listed = notice.doses.slice(0, 3).map((dose) => `${dose.vaccine.name} 第 ${dose.dose} 剂`)
  const more = notice.doses.length > 3 ? ` 等 ${notice.doses.length} 剂` : ''
  return `${listed.join('、')}${more}`
}

/** Title "小米粒的疫苗提醒", a line per notice: "3 天后该打：百白破疫苗 第 2 剂". */
export function vaccineMessage(
  babyId: string,
  name: string,
  notices: VaccineNotice[],
): PushMessage {
  const first = notices[0]
  const lines = notices.map((notice) =>
    notice.when === 'today'
      ? `今天可以打：${doseList(notice)}`
      : notice.when === 'soon'
        ? `3 天后该打：${doseList(notice)}`
        : `还没打，记得补种：${doseList(notice)}`,
  )
  return {
    title: first?.when === 'overdue' ? `${name}有疫苗待补种` : `${name}的疫苗提醒`,
    body: lines.join('\n'),
    tag: `vaccine-${babyId}`,
    url: '/vaccines',
  }
}

/**
 * Cron entry point, each quarter hour: for devices where it is now 9:00 to 9:14, reminds
 * their users of the vaccinations of each baby they see (unless turned off), at most once
 * a day per baby.
 */
export async function dispatchVaccineReminders(
  env: Pick<Env, 'DB' | 'BETTER_AUTH_URL'>,
  now: number,
  fetcher?: typeof fetch,
): Promise<number> {
  const db = env.DB
  const { results: devices } = await db
    .prepare(
      `select endpoint, p256dh, auth, user_id as userId, time_zone as timeZone
       from push_subscriptions`,
    )
    .all<Device>()
  // Each user once, on the day of a device whose morning it is.
  const dayOf = new Map<string, string>()
  const due = devices.filter((device) => {
    const zone = device.timeZone ?? DEFAULT_TIME_ZONE
    const minute = minuteOfDayIn(zone)(now)
    if (minute < SEND_MINUTE || minute >= SEND_MINUTE + WINDOW_MINUTES) return false
    if (!dayOf.has(device.userId)) dayOf.set(device.userId, localDay(now, zone))
    return true
  })
  if (due.length === 0) return 0

  const users = [...dayOf.keys()]
  const { results: babies } = await db
    .prepare(
      `select m.user_id as userId, b.id as babyId, b.name, b.birth_date as birthDate, b.sex,
         b.vaccine_plan as vaccinePlan, coalesce(v.sent_on, '') as sentOn
       from babies b
       join memberships m on m.family_id = b.family_id
       left join vaccine_reminders v on v.user_id = m.user_id and v.baby_id = b.id
       where m.user_id in (select value from json_each(?1))
         and b.deleted_at is null and b.archived_at is null
         and coalesce(v.enabled, 1) = 1
         and ${memberSeesBaby('b.id')}`,
    )
    .bind(JSON.stringify(users))
    .all<BabyRow & { sentOn: string }>()
  const waiting = babies.filter((baby) => baby.sentOn !== dayOf.get(baby.userId))
  if (waiting.length === 0) return 0

  const { results: given } = await db
    .prepare(
      `select baby_id as babyId, data, start_at as startAt from events
       where type = 'vaccination' and deleted_at is null
         and baby_id in (select value from json_each(?))`,
    )
    .bind(JSON.stringify([...new Set(waiting.map((baby) => baby.babyId))]))
    .all<{ babyId: string; data: string; startAt: number }>()

  // What this run takes on, within its share of pushes.
  const planned: { baby: BabyRow; today: string; notices: VaccineNotice[]; targets: Device[] }[] =
    []
  let planSends = 0
  for (const baby of waiting) {
    const today = dayOf.get(baby.userId) ?? ''
    const targets = due.filter((device) => device.userId === baby.userId)
    const zone = targets[0]?.timeZone ?? DEFAULT_TIME_ZONE
    const doses = new Map<string, string>()
    for (const row of given) {
      if (row.babyId !== baby.babyId) continue
      const data = vaccinationDataSchema.safeParse(JSON.parse(row.data))
      if (data.success) {
        doses.set(`${data.data.vaccineId}:${data.data.dose}`, localDay(row.startAt, zone))
      }
    }
    const settings = baby.vaccinePlan
      ? vaccinePlanSchema.safeParse(JSON.parse(baby.vaccinePlan))
      : null
    const choices = settings?.success ? settings.data : noChoices('cn')
    const notices = vaccineNotices(
      vaccinePlan(baby.birthDate, baby.sex, today, choices, doses),
      today,
    )
    if (notices.length === 0) continue
    if (planned.length > 0 && planSends + targets.length > MAX_SENDS) break
    planned.push({ baby, today, notices, targets })
    planSends += targets.length
  }
  if (planned.length === 0) return 0

  // Claimed before sending, so overlapping runs never send the same day twice.
  const claims = await db.batch(
    planned.map(({ baby, today }) =>
      db
        .prepare(
          `insert into vaccine_reminders (user_id, baby_id, enabled, sent_on, updated_at)
           values (?1, ?2, 1, ?3, ?4)
           on conflict (user_id, baby_id) do update set sent_on = excluded.sent_on
           where vaccine_reminders.sent_on <> excluded.sent_on`,
        )
        .bind(baby.userId, baby.babyId, today, now),
    ),
  )
  const keys = await getVapidKeys(db)
  const sends: Promise<PushResult>[] = []
  const sentTo: PushTarget[] = []
  planned.forEach(({ baby, notices, targets }, index) => {
    if (claims[index]?.meta.changes !== 1) return
    const message = vaccineMessage(baby.babyId, baby.name, notices)
    for (const target of targets) {
      sentTo.push(target)
      sends.push(sendPush(target, message, keys, env.BETTER_AUTH_URL, now, fetcher))
    }
  })
  const results = await Promise.all(sends)
  await removeGone(db, sentTo, results)
  return results.filter((result) => result === 'sent').length
}
