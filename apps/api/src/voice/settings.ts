import type { VoiceSettings } from '@lullabo/shared'

import { loadAccess } from '../access'
import { aiForUser } from '../agent/keys'
import { tokenStatus } from './tokens'

export const DEFAULT_PHRASE = '记录宝宝'
const DEFAULT_ZONE = 'Asia/Shanghai'
const DEFAULT_LOCALE = 'zh-CN'

export interface Settings {
  phrase: string
  timeZone: string
  locale: string
}

export async function readSettings(db: D1Database, userId: string): Promise<Settings> {
  const row = await db
    .prepare('select phrase, time_zone as timeZone, locale from voice_settings where user_id = ?')
    .bind(userId)
    .first<Settings>()
  return row ?? { phrase: DEFAULT_PHRASE, timeZone: DEFAULT_ZONE, locale: DEFAULT_LOCALE }
}

/** Saves the user's shortcut settings, keeping their conversation. */
export function saveSettings(db: D1Database, userId: string, settings: Settings, now: number) {
  return db
    .prepare(
      `insert into voice_settings (user_id, phrase, time_zone, locale, updated_at)
       values (?, ?, ?, ?, ?)
       on conflict (user_id) do update set phrase = excluded.phrase,
         time_zone = excluded.time_zone, locale = excluded.locale,
         updated_at = excluded.updated_at`,
    )
    .bind(userId, settings.phrase, settings.timeZone, settings.locale, now)
    .run()
}

/** What the settings page shows. */
export async function settingsView(
  db: D1Database,
  userId: string,
  now: number,
): Promise<VoiceSettings> {
  const [settings, token, access] = await Promise.all([
    readSettings(db, userId),
    tokenStatus(db, userId, now),
    loadAccess(db, userId),
  ])
  const ai = await aiForUser(db, userId, access)
  const family = ai?.kind === 'shared' ? access.get(ai.ai.familyId) : undefined
  return {
    phrase: settings.phrase,
    token: token ?? null,
    /** Whose AI commands use: the user's own, one a family shared (only for it), or none. */
    ai:
      ai?.kind === 'own'
        ? { kind: 'own' as const }
        : ai && family
          ? { kind: 'shared' as const, familyName: family.alias ?? family.name, by: ai.ai.name }
          : null,
  }
}

/** Counts a message to the model; returns the user's count for the day. */
export async function countMessage(
  db: D1Database,
  userId: string,
  settings: Settings,
  now: number,
) {
  const day = new Date(now).toISOString().slice(0, 10)
  const row = await db
    .prepare(
      `insert into voice_settings (user_id, phrase, time_zone, day, day_count, updated_at)
       values (?1, ?2, ?3, ?4, 1, ?5)
       on conflict (user_id) do update set
         day_count = case when day = excluded.day then day_count + 1 else 1 end,
         day = excluded.day
       returning day_count as dayCount`,
    )
    .bind(userId, settings.phrase, settings.timeZone, day, now)
    .first<{ dayCount: number }>()
  return row?.dayCount ?? 0
}
