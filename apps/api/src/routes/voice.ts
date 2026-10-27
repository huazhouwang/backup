import { idTime } from '@lullabo/shared'
import type { AnyTextAdapter, ModelMessage } from '@tanstack/ai'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'

import { type Access, loadAccess } from '../access'
import { spokenWords, writableBabies } from '../agent/data'
import { correctHeard } from '../agent/heard'
import { type SavedAi, aiForUser } from '../agent/keys'
import { KEEP_MS } from '../agent/retention'
import {
  type AgentScope,
  type AgentTurn,
  SESSION_IDLE_MS,
  runAgent,
  threadPrefix,
  threadRange,
  withoutThinking,
} from '../agent/run'
import type { Env } from '../env'
import { json } from '../http'
import type { AppEnv } from '../types'
import { modelOptionsFor } from '../voice/ai'
import { DAILY_LIMIT, createToken, revokeToken, tokenStatus, useToken } from '../voice/tokens'
import { transcribe } from '../voice/transcribe'

export const DEFAULT_PHRASE = '记录宝宝'
const DEFAULT_ZONE = 'Asia/Shanghai'
const DEFAULT_LOCALE = 'zh-CN'
const MAX_TEXT = 300

/** The model behind a saved AI setting; tests pass a fake instead of calling a provider. */
export type AdapterFor = (env: Env, ai: SavedAi) => Promise<AnyTextAdapter | null>

const isTimeZone = (zone: string) => {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone !== ''
  } catch {
    return false
  }
}

const timeZoneSchema = z.string().max(64).refine(isTimeZone)
/** The app's language, which the assistant replies in. */
const localeSchema = z
  .string()
  .max(35)
  .refine((locale) => {
    try {
      return Intl.getCanonicalLocales(locale).length === 1
    } catch {
      return false
    }
  })
const settingsSchema = z.object({
  phrase: z.string().trim().min(1).max(20).optional(),
  locale: localeSchema.optional(),
})
const tokenCreateSchema = z.object({
  timeZone: timeZoneSchema.optional(),
  locale: localeSchema.optional(),
})
const textSchema = z.object({
  text: z.string().trim().min(1).max(MAX_TEXT),
  timeZone: timeZoneSchema.optional(),
  locale: localeSchema.optional(),
  /** Heard from a recording: speech recognition's mistakes are corrected first. */
  spoken: z.boolean().optional(),
  /**
   * The chat's last few lines, which help correct what was heard. Only context: a long
   * reply is cut short rather than refusing the message.
   */
  recent: z
    .array(z.string().transform((line) => line.slice(0, MAX_TEXT)))
    .transform((lines) => lines.slice(-4))
    .optional(),
  /** The tip the chat was opened from, to ask about it (a tip id). */
  tip: z.string().max(64).optional(),
})

/**
 * What comes with a recording: the language it is likely in (the app's), the
 * assistant's last line, and whether it is a part heard while the user is still talking.
 */
const speechQuerySchema = z.object({
  speech: localeSchema.optional(),
  recent: z
    .string()
    .transform((line) => line.slice(0, MAX_TEXT))
    .optional(),
  partial: z.literal('1').optional(),
  /** How long recording took to start on the device (ms), and taking the microphone. */
  ready: z
    .string()
    .regex(/^\d{1,6}$/)
    .optional(),
  mic: z
    .string()
    .regex(/^\d{1,6}$/)
    .optional(),
  /** How many times the microphone was taken again before anything came through. */
  retakes: z.string().regex(/^\d$/).optional(),
})
/** What the audio was doing when a recording on the device heard nothing. */
const unheardSchema = z.object({
  contextState: z.string().max(20),
  waitedMs: z.number().int().min(0).max(600_000),
  /** Each time the microphone was taken again, and why. */
  retakes: z.array(z.enum(['silent', 'muted', 'ended'])).max(5),
  /** The microphone at the end. */
  track: z
    .object({ muted: z.boolean(), readyState: z.string().max(20), enabled: z.boolean() })
    .nullable(),
  /** Times the device's tap ran with nothing coming in. */
  emptyBlocks: z.number().int().min(0).max(1_000_000),
  sessionType: z.string().max(20).nullable(),
  sinceSessionChangeMs: z.number().int().min(0).max(3_600_000),
  visibility: z.string().max(20),
  cueMode: z.string().max(20),
})

/** Foods and medicines logged within this long help recognise speech. */
const WORDS_SINCE_MS = 30 * 86_400_000
/** A WAV header and a fraction of a second: anything shorter holds nothing to hear. */
const MIN_AUDIO_BYTES = 4000

const REPLIES = {
  invalidToken: '口令已失效，请到 Lullabo 的设置 → Siri 语音记录里重新添加。',
  limited: '今天说得太多次了，明天再试吧。',
  slowDown: '说得太快了，请稍等一下再试。',
  unavailable: '语音记录暂时不可用，请稍后再试。',
  noAi: '还没有可用的 AI。请在 Lullabo 的 设置 → 我的 AI 里填自己的 key，或请家人分享给家庭。',
  noFamily: '还没有可以记录的家庭。',
  unclear: '没听清，请再说一遍。',
}

const stop = (reply: string): AgentTurn => ({ reply, done: true, confirming: false })

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
function saveSettings(db: D1Database, userId: string, settings: Settings, now: number) {
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
async function settingsView(db: D1Database, userId: string, now: number) {
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

const messageText = (message: ModelMessage) =>
  withoutThinking(
    typeof message.content === 'string'
      ? message.content
      : (message.content ?? []).map((part) => (part.type === 'text' ? part.content : '')).join(''),
  )

/** Messages on the chat box's first page, and on each earlier one. */
const FIRST_PAGE = 10
const MORE_PAGE = 20
/** Conversations read at a time while filling a page. */
const THREAD_BATCH = 5

interface ChatLine {
  /** `${threadId}~${index}`: stable, and where an earlier page ends. */
  id: string
  threadId: string
  role: 'user' | 'assistant'
  text: string
}

/** What a conversation shows: what the user said and the answers, not tool calls. */
function visibleLines(threadId: string, messagesJson: string): ChatLine[] {
  let messages: ModelMessage[]
  try {
    messages = JSON.parse(messagesJson)
  } catch {
    return []
  }
  const lines: ChatLine[] = []
  for (const message of messages) {
    if (message.role !== 'user' && message.role !== 'assistant') continue
    const text = messageText(message).trim()
    if (text) lines.push({ id: `${threadId}~${lines.length}`, threadId, role: message.role, text })
  }
  return lines
}

/**
 * A page of the user's conversations with Siri and the chat box over the last 30 days: the
 * latest messages, or those just before `before` (a page's `next`). Each conversation comes
 * with when it started, and the one the next message continues is named.
 */
async function transcript(db: D1Database, userId: string, now: number, before?: string) {
  const prefix = threadPrefix(userId)
  const range = threadRange(userId)
  const [cursorThread = '', cursorIndex = ''] = before?.split('~') ?? []
  const fromCursor = cursorThread.startsWith(prefix) ? cursorThread : null
  const end = Number.parseInt(cursorIndex, 10)
  let wanted = fromCursor ? MORE_PAGE : FIRST_PAGE
  const lines: ChatLine[] = []
  let next: string | null = null
  // Older conversations a batch at a time, until the page is full.
  let upTo = fromCursor
  let inclusive = true
  while (wanted > 0) {
    // One batch after another: each starts where the last ended, and most pages need one.
    // oxlint-disable-next-line no-await-in-loop
    const { results } = await db
      .prepare(
        `select thread_id as threadId, messages_json as json from chat_threads
         where thread_id >= ?1 and thread_id < ?6 and updated_at >= ?2
           and (?3 is null or thread_id < ?3 or (?4 and thread_id = ?3))
         order by thread_id desc limit ?5`,
      )
      .bind(range.from, now - KEEP_MS, upTo, inclusive ? 1 : 0, THREAD_BATCH, range.to)
      .all<{ threadId: string; json: string }>()
    for (const row of results) {
      const all = visibleLines(row.threadId, row.json)
      const until = row.threadId === fromCursor && end >= 0 ? Math.min(end, all.length) : all.length
      const start = Math.max(0, until - wanted)
      lines.unshift(...all.slice(start, until))
      wanted -= until - start
      if (wanted === 0) {
        next = `${row.threadId}~${start}`
        break
      }
    }
    if (wanted === 0 || results.length < THREAD_BATCH) break
    upTo = results.at(-1)?.threadId ?? null
    inclusive = false
  }
  const threads = Object.fromEntries(
    [...new Set(lines.map((line) => line.threadId))].map((id) => [
      id,
      { startedAt: idTime(id.slice(prefix.length)) },
    ]),
  )
  const row = await db
    .prepare(
      'select thread_id as threadId, thread_active_at as activeAt from voice_settings where user_id = ?',
    )
    .bind(userId)
    .first<{ threadId: string | null; activeAt: number | null }>()
  const activeThreadId =
    row?.threadId && row.activeAt !== null && now - row.activeAt <= SESSION_IDLE_MS
      ? row.threadId
      : null
  return { lines, threads, next, activeThreadId }
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

/** The babies' names and the foods and medicines logged for them: words speech may contain. */
async function speechHints(db: D1Database, access: Access, now: number) {
  const babies = await writableBabies(db, [...access.values()])
  const words = await spokenWords(
    db,
    babies.map((baby) => baby.id),
    now - WORDS_SINCE_MS,
  )
  return { names: babies.map((baby) => baby.name), words }
}

interface TurnOptions {
  /** The device's zone and the app's language, when they come with the message. */
  timeZone?: string
  locale?: string
  /** Heard from a recording: corrected first, with the chat's last lines as context. */
  spoken?: { recent: string[]; onHeard: (text: string) => void }
  /** The reply so far, as the model writes it. */
  onText?: (text: string) => void
  /** The tip the chat was opened from. */
  tip?: string
}

/** One message to the user's agent, from the chat box or Siri. */
async function turn(
  env: Env,
  adapterFor: AdapterFor,
  userId: string,
  said: string,
  now: number,
  options: TurnOptions = {},
): Promise<AgentTurn> {
  const db = env.DB
  const [access, settings] = await Promise.all([loadAccess(db, userId), readSettings(db, userId)])
  const families = [...access.values()].filter((family) => family.role !== 'viewer')
  if (families.length === 0) return stop(REPLIES.noFamily)
  const ai = await aiForUser(db, userId, access)
  const adapter = ai ? await adapterFor(env, ai.ai) : null
  if (!ai || !adapter) return stop(REPLIES.noAi)
  // Siri and the chat box together: nobody runs up their own or a shared key's bill.
  if ((await countMessage(db, userId, settings, now)) > DAILY_LIMIT) return stop(REPLIES.limited)
  const scope: AgentScope = {
    db,
    access,
    families: families.filter((family) => ai.familyIds.includes(family.id)),
    sharedOnly: ai.kind === 'shared',
    keyScope: ai.kind === 'own' ? 'own' : `shared:${ai.ai.userId}:${ai.ai.familyId}`,
    userId,
    timeZone: options.timeZone ?? settings.timeZone,
    locale: options.locale ?? settings.locale,
    phrase: settings.phrase,
    modelOptions: modelOptionsFor(ai.ai.provider, ai.ai.model),
    onText: options.onText,
    tip: options.tip,
  }
  let text = said
  if (options.spoken) {
    const hints = await speechHints(db, access, now)
    const correctors = { own: { adapter, modelOptions: scope.modelOptions }, quick: env.AI }
    text = await correctHeard(correctors, said, {
      ...hints,
      conversation: options.spoken.recent,
    })
    options.spoken.onHeard(text)
  }
  return runAgent(adapter, scope, text, now)
}

/** Settings page and chat box. Needs a session. */
export function voiceRoutes(adapterFor: AdapterFor) {
  return (
    new Hono<AppEnv>()
      .get('/', async (c) => c.json(await settingsView(c.env.DB, c.get('user').id, Date.now())))
      .patch('/', json(settingsSchema), async (c) => {
        const db = c.env.DB
        const userId = c.get('user').id
        const now = Date.now()
        const current = await readSettings(db, userId)
        const { phrase = current.phrase, locale = current.locale } = c.req.valid('json')
        await saveSettings(db, userId, { ...current, phrase, locale }, now)
        return c.json(await settingsView(db, userId, now))
      })
      .post('/token', json(tokenCreateSchema), async (c) => {
        const db = c.env.DB
        const userId = c.get('user').id
        const now = Date.now()
        const { timeZone, locale } = c.req.valid('json')
        if (timeZone || locale) {
          const current = await readSettings(db, userId)
          await saveSettings(
            db,
            userId,
            {
              ...current,
              timeZone: timeZone ?? current.timeZone,
              locale: locale ?? current.locale,
            },
            now,
          )
        }
        return c.json(await createToken(db, userId, now))
      })
      .delete('/token', async (c) => {
        await revokeToken(c.env.DB, c.get('user').id).run()
        return c.body(null, 204)
      })
      .delete('/tokens/:id', async (c) => {
        await revokeToken(c.env.DB, c.get('user').id, c.req.param('id')).run()
        return c.body(null, 204)
      })
      .get('/chat', async (c) =>
        c.json(await transcript(c.env.DB, c.get('user').id, Date.now(), c.req.query('before'))),
      )
      .post('/chat', json(textSchema), async (c) => {
        const userId = c.get('user').id
        const { text, timeZone, locale, spoken, recent = [], tip } = c.req.valid('json')
        // The chat asks for the answer as it is written; other callers get it whole.
        if (c.req.header('Accept')?.includes('text/event-stream')) {
          return streamSSE(c, async (stream) => {
            // Events go out in order, whenever the model or the correction produces them.
            let queue = Promise.resolve()
            const send = (event: string, data: unknown) => {
              queue = queue.then(() => stream.writeSSE({ event, data: JSON.stringify(data) }))
            }
            let result: AgentTurn
            const burst = await c.env.VOICE_RATE_LIMIT?.limit({ key: userId })
            if (burst && !burst.success) result = stop(REPLIES.slowDown)
            else {
              try {
                result = await turn(c.env, adapterFor, userId, text, Date.now(), {
                  timeZone,
                  locale,
                  tip,
                  spoken: spoken
                    ? { recent, onHeard: (heard) => send('heard', { text: heard }) }
                    : undefined,
                  onText: (reply) => send('text', { text: reply }),
                })
              } catch (error) {
                console.error('Voice chat failed', error)
                result = stop(REPLIES.unavailable)
              }
            }
            send('done', result)
            await queue
          })
        }
        // Each message calls the model.
        const burst = await c.env.VOICE_RATE_LIMIT?.limit({ key: userId })
        if (burst && !burst.success) return c.json(stop(REPLIES.slowDown), 429)
        try {
          return c.json(
            await turn(c.env, adapterFor, userId, text, Date.now(), { timeZone, locale, tip }),
          )
        } catch (error) {
          console.error('Voice chat failed', error)
          return c.json(stop(REPLIES.unavailable), 503)
        }
      })
      // A recording that heard nothing on the device: logged to find out why. Nothing is kept.
      .post('/unheard', json(unheardSchema), (c) => {
        console.log('Recording unheard', c.req.valid('json'))
        return c.body(null, 204)
      })
      .post('/transcribe', async (c) => {
        // A recording from the chat's microphone, as text in the speaker's language: a part
        // while they are still talking, or the whole of it. The recording is not kept; the chat
        // then sends the text like anything typed.
        const userId = c.get('user').id
        const ai = c.env.AI
        if (!ai) return c.json({ text: null }, 503)
        const query = speechQuerySchema.safeParse(c.req.query())
        const partial = query.success && query.data.partial === '1'
        const limiter = partial ? c.env.SPEECH_RATE_LIMIT : c.env.VOICE_RATE_LIMIT
        const burst = await limiter?.limit({ key: userId })
        if (burst && !burst.success) return c.json({ text: null }, 429)
        const audio = await c.req.arrayBuffer()
        if (!query.success || audio.byteLength < MIN_AUDIO_BYTES) return c.json({ text: null }, 400)
        const db = c.env.DB
        const now = Date.now()
        const [access, settings] = await Promise.all([
          loadAccess(db, userId),
          readSettings(db, userId),
        ])
        // The whole recording costs like a message does, so it counts towards the day's limit.
        // The parts heard while talking are only previews of it, held back by their own limit.
        if (!partial && (await countMessage(db, userId, settings, now)) > DAILY_LIMIT) {
          return c.json({ text: null }, 429)
        }
        const { ready, mic, retakes } = query.data
        if (ready) {
          console.log('Recording startup', {
            readyMs: Number(ready),
            micMs: Number(mic),
            retakes: Number(retakes ?? 0),
          })
        }
        const hints = { ...(await speechHints(db, access, now)), recent: query.data.recent }
        try {
          return c.json({ text: await transcribe(ai, audio, query.data.speech, hints) })
        } catch (error) {
          console.error('Transcription failed', error)
          return c.json({ text: null }, 503)
        }
      })
  )
}

/**
 * What the Siri shortcut calls, with its code instead of a session. Always answers 200 with
 * `{ ok, done, confirming, reply, next, end? }`: Shortcuts may not read the body of an error response,
 * which would leave Siri silent. The shortcut reads `reply` aloud and asks "还有吗？" until
 * `done`, which the agent sets when the user is finished, or the server when asking again
 * cannot help.
 */
export function siriRoutes(adapterFor: AdapterFor) {
  return new Hono<AppEnv>().post('/', async (c) => {
    // `end` is there only when the conversation is over, so the shortcut ends on "has any
    // value", which needs nothing to compare: its If has lost compared text across iOS
    // versions. `next` is the older form, for shortcuts added before.
    const answer = (result: AgentTurn, ok: boolean) =>
      c.json({
        ok,
        ...result,
        next: result.done ? 'stop' : 'ask',
        ...(result.done ? { end: '1' } : {}),
      })
    const now = Date.now()
    const check = await useToken(c.env.DB, c.req.header('Authorization'), now)
    if (check.status === 'invalid') return answer(stop(REPLIES.invalidToken), false)
    if (check.status === 'limited') return answer(stop(REPLIES.limited), false)
    const burst = await c.env.VOICE_RATE_LIMIT?.limit({ key: check.token.id })
    if (burst && !burst.success) return answer(stop(REPLIES.slowDown), false)

    const body = textSchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) {
      return answer({ reply: REPLIES.unclear, done: false, confirming: false }, false)
    }
    try {
      return answer(await turn(c.env, adapterFor, check.token.userId, body.data.text, now), true)
    } catch (error) {
      console.error('Voice command failed', error)
      return answer(stop(REPLIES.unavailable), false)
    }
  })
}
