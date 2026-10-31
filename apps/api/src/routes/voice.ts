import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'

import { loadAccess } from '../access'
import { withinDailyLimit } from '../agent/budget'
import type { AgentTurn } from '../agent/scope'
import { REPLIES, speechHints, stop, turn } from '../agent/turn'
import { json } from '../http'
import type { AppEnv } from '../types'
import { localeSchema, textSchema, timeZoneSchema } from '../validation'
import { readSettings, saveSettings, settingsView } from '../voice/settings'
import { createToken, revokeToken } from '../voice/tokens'
import { transcribe } from '../voice/transcribe'
import { transcript } from '../voice/transcript'

const settingsSchema = z.object({
  phrase: z.string().trim().min(1).max(20).optional(),
  locale: localeSchema.optional(),
})
const tokenCreateSchema = z.object({
  timeZone: timeZoneSchema.optional(),
  locale: localeSchema.optional(),
})
/**
 * What comes with a recording: the language it is likely in (the app's), and whether it
 * is a part heard while the user is still talking.
 */
const speechQuerySchema = z.object({
  speech: localeSchema.optional(),
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

/** A WAV header and a fraction of a second: anything shorter holds nothing to hear. */
const MIN_AUDIO_BYTES = 4000

/** Settings page and chat box. Needs a session. */
export const voiceRoutes = new Hono<AppEnv>()
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
            result = await turn(c.env, c.get('adapterFor'), userId, text, Date.now(), {
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
        await turn(c.env, c.get('adapterFor'), userId, text, Date.now(), { timeZone, locale, tip }),
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
    const [access, settings] = await Promise.all([loadAccess(db, userId), readSettings(db, userId)])
    // The whole recording costs like a message does, so it counts towards the day's limit.
    // The parts heard while talking are only previews of it, held back by their own limit.
    if (!partial && !(await withinDailyLimit(db, userId, settings, now))) {
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
    const hints = await speechHints(db, access, now)
    try {
      return c.json({ text: await transcribe(ai, audio, query.data.speech, hints) })
    } catch (error) {
      console.error('Transcription failed', error)
      return c.json({ text: null }, 503)
    }
  })
