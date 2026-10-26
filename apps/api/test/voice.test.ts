import { type Event, type PullResponse, newId } from '@bobo/shared'
import { fakeText } from '@tanstack/ai/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { VoiceAction } from '../src/voice/action'
import { clockToTime } from '../src/voice/plan'
import { createTestApp } from './app'
import { baby } from './fixtures'

type Answer = { ok: boolean; done: boolean; confirming: boolean; reply: string }
const answerOf = (res: Response): Promise<Answer> => res.json()

const action = (overrides: Partial<VoiceAction>): VoiceAction => ({
  type: 'diaper',
  baby: null,
  time: null,
  minutesAgo: null,
  durationMinutes: null,
  timer: null,
  stops: null,
  diaper: null,
  amountMl: null,
  milk: null,
  breastMl: null,
  formulaMl: null,
  side: null,
  leftMinutes: null,
  rightMinutes: null,
  food: null,
  celsius: null,
  medicine: null,
  dose: null,
  weightKg: null,
  lengthCm: null,
  headCm: null,
  text: null,
  ...overrides,
})

const KEY = 'sk-or-v1-0123456789'

describe('siri voice logging', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>
  let headers: Headers
  let myId: string
  let familyId: string
  const fake = fakeText()
  // The model the last message ran on (by saved key hint), and what it was told.
  let usedKey: string | undefined
  let system = ''
  // What the fake Whisper hears next, and what it was asked.
  let heard = ''
  let whisper: { language?: string; initial_prompt?: string } = {}
  // The correction model on Workers AI: what it was told, and what it answers next.
  let correction = ''
  let corrected: string | null = null
  const whisperAi = {
    run: async (model: string, input: typeof whisper & { messages?: { content: string }[] }) => {
      if (model.includes('whisper')) {
        whisper = input
        return { text: heard }
      }
      correction = JSON.stringify(input.messages ?? [])
      const said = /<transcription>(.*)<\/transcription>/.exec(correction)?.[1] ?? ''
      return { choices: [{ message: { content: `<think>\n\n</think>\n${corrected ?? said}` } }] }
    },
  } as unknown as Ai

  const siri = (token: string | null, text: string) =>
    t.request('/api/voice/siri', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ text }),
    })
  const hear = (bytes: number, query = 'en-GB') =>
    t.request(`/api/voice/transcribe?speech=${query}`, {
      method: 'POST',
      headers: { cookie: headers.get('cookie') ?? '', 'Content-Type': 'audio/wav' },
      body: new Uint8Array(bytes),
    })
  const day = async () =>
    (
      await t.env.DB.prepare('select day_count as n from voice_settings where user_id = ?')
        .bind(myId)
        .first<{ n: number }>()
    )?.n
  /** Says something with the model recording `actions`, then answering `reply`. */
  // One model call: once saved, the record's summary is the answer.
  const record = async (token: string, text: string, actions: VoiceAction[]) => {
    fake.setResponses([
      ({ request }) => {
        system = JSON.stringify(request.systemPrompts ?? [])
        return { toolCalls: [{ name: 'record', input: { actions, confirmed: false } }] }
      },
    ])
    return answerOf(await siri(token, text))
  }
  const works = async (token: string) =>
    (await record(token, '换尿布', [action({ type: 'diaper' })])).ok
  const newToken = async (h = headers) => {
    const res = await t.send('POST', '/api/voice/token', h, { timeZone: 'Asia/Shanghai' })
    expect(res.status).toBe(200)
    return (await res.json()) as { id: string; token: string }
  }
  const events = async (h = headers) => {
    const res = await t.request('/api/sync/pull?cursor=', { headers: h })
    const page = (await res.json()) as PullResponse
    return page.events.filter((event: Event) => event.deletedAt === null)
  }
  const newFamily = async (h: Headers, name: string, babyName: string) => {
    const res = await t.send('POST', '/api/families', h, { name })
    const created: { id: string } = await res.json()
    await t.send('POST', '/api/sync/push', h, {
      babies: [baby(created.id, { name: babyName })],
      events: [],
    })
    return created.id
  }
  const join = async (inviter: Headers, family: string, joiner: Headers, role = 'caregiver') => {
    const invite = await t.send('POST', `/api/families/${family}/invites`, inviter, {
      role,
      babyIds: null,
    })
    const { code } = (await invite.json()) as { code: string }
    await t.send('POST', `/api/invites/${code}/accept`, joiner)
  }

  beforeAll(async () => {
    t = await createTestApp(
      { ENCRYPTION_SECRET: 'test-ai-key-secret-test-ai-key-secret', AI: whisperAi },
      {
        voiceAdapter: async (_env, ai) => {
          usedKey = ai.keyHint
          return fake
        },
      },
    )
    const me = await t.signIn()
    headers = me.headers
    myId = me.user.id
    familyId = await newFamily(headers, '我们家', '小米粒')
  })
  afterAll(() => t.dispose())

  it('answers that there is no AI yet', async () => {
    const { token } = await newToken()
    const result = await answerOf(await siri(token, '换尿布'))
    expect(result).toMatchObject({ done: true, reply: expect.stringMatching(/还没有可用的 AI/) })
    const settings: unknown = await (await t.request('/api/voice', { headers })).json()
    expect(settings).toMatchObject({ ai: null })
    await t.saveAi(headers, KEY)
  })

  it('keeps the phrase and shows the code only when created', async () => {
    let res = await t.request('/api/voice', { headers })
    expect(await res.json()).toMatchObject({ phrase: '记录宝宝', ai: { kind: 'own' } })
    res = await t.send('PATCH', '/api/voice', headers, { phrase: '宝宝日记' })
    expect(await res.json()).toMatchObject({ phrase: '宝宝日记' })
    const { token } = await newToken()
    expect(token).toMatch(/^bobo_/)
    res = await t.request('/api/voice', { headers })
    const settings = (await res.json()) as { token: { createdAt: number } | null }
    expect(settings.token?.createdAt).toBeTypeOf('number')
    expect(JSON.stringify(settings)).not.toContain(token)
  })

  it('takes the code with or without the Bearer scheme', async () => {
    const { token } = await newToken()
    fake.setResponses([{ text: '你好。' }])
    const res = await t.request('/api/voice/siri', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token },
      body: JSON.stringify({ text: '你好' }),
    })
    expect(await answerOf(res)).toEqual({
      ok: true,
      done: false,
      confirming: false,
      reply: '你好。',
      next: 'ask',
    })
  })

  it('needs a valid code', async () => {
    expect((await answerOf(await siri(null, '换尿布'))).ok).toBe(false)
    const res = await siri('bobo_nope', '换尿布')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: false,
      done: true,
      confirming: false,
      reply: expect.stringContaining('口令已失效'),
      next: 'stop',
      end: '1',
    })
  })

  it('records what was said and syncs it to the app', async () => {
    const { token } = await newToken()
    const earlier = new Set((await events()).map((event) => event.id))
    const result = await record(token, '小米粒换尿布了，还喝了120毫升奶', [
      action({ type: 'diaper', baby: '小米粒' }),
      action({ type: 'bottle', baby: '小米粒', amountMl: 120, milk: 'formula' }),
    ])
    expect(result).toMatchObject({ ok: true, done: false })
    expect(result.reply).toMatch(/^已记录：小米粒 .*换尿布.*；小米粒 .*瓶喂 120 毫升.*。还有吗？$/)
    const stored = (await events()).filter((event) => !earlier.has(event.id))
    expect(stored.map((event) => event.type).toSorted()).toEqual(['diaper', 'feeding'])
    expect(stored.every((event) => event.createdBy !== null)).toBe(true)
    // A bottle said without a duration is finished, not a running timer.
    const bottle = stored.find((event) => event.type === 'feeding')
    expect(bottle?.endAt).toBe(bottle?.startAt)
  })

  it("replies in the app's language, as the app last set it", async () => {
    const { token } = await newToken()
    await record(token, '换尿布', [action({ type: 'diaper' })])
    expect(system).toContain('用中文回答')

    const changed = await t.send('PATCH', '/api/voice', headers, { locale: 'en-US' })
    expect(changed.status).toBe(200)
    await record(token, '换尿布', [action({ type: 'diaper' })])
    expect(system).toContain('用英语回答')

    expect((await t.send('PATCH', '/api/voice', headers, { locale: 'not a locale' })).status).toBe(
      400,
    )
    await t.send('PATCH', '/api/voice', headers, { locale: 'zh-CN' })
  })

  it('ends when the agent says the user is done', async () => {
    const { token } = await newToken()
    fake.setResponses([
      { toolCalls: [{ name: 'end_conversation', input: {} }] },
      { text: '好的，再见。' },
    ])
    expect(await answerOf(await siri(token, '没有了'))).toMatchObject({ ok: true, done: true })
  })

  it('chats in the app, in the same conversation as Siri', async () => {
    const { token } = await newToken()
    await record(token, '换尿布', [action({ type: 'diaper' })])
    fake.setResponses([{ text: '今天换了几次尿布。' }])
    const res = await t.send('POST', '/api/voice/chat', headers, { text: '今天怎么样' })
    expect(await res.json()).toEqual({
      reply: '今天换了几次尿布。',
      done: false,
      confirming: false,
    })
    const chat = await t.request('/api/voice/chat', { headers })
    const { lines } = (await chat.json()) as { lines: Array<{ role: string; text: string }> }
    expect(lines.slice(-4).map(({ role, text }) => ({ role, text }))).toEqual([
      { role: 'user', text: '换尿布' },
      { role: 'assistant', text: expect.stringMatching(/^已记录：.*换尿布.*。还有吗？$/) },
      { role: 'user', text: '今天怎么样' },
      { role: 'assistant', text: '今天换了几次尿布。' },
    ])
  })

  it('hears a recording in the speaker’s language, as text for the chat box to send', async () => {
    heard = ' how was today '
    expect(await (await hear(32_000)).json()).toEqual({ text: 'how was today' })
    // The language is Whisper's to tell, given the babies' names to spell; no Chinese
    // vocabulary for an app in English.
    expect(whisper.language).toBeUndefined()
    expect(whisper.initial_prompt).toBe('小米粒')

    // In Chinese the prompt also carries the words it should spell in simplified script,
    // after the assistant's last line, which this may answer.
    heard = '  '
    expect(await (await hear(32_000, 'zh-Hans-CN&recent=要删除吗？')).json()).toEqual({
      text: null,
    })
    expect(whisper.language).toBeUndefined()
    expect(whisper.initial_prompt).toMatch(/^要删除吗？ 小米粒 .*毫升/)
    // Too short to hold anything, or over the body limit.
    expect((await hear(100)).status).toBe(400)
    expect((await hear(1024 * 1024 + 1)).status).toBe(413)
  })

  it('logs what the audio was doing when a recording heard nothing, and keeps nothing', async () => {
    const report = (body: unknown) =>
      t.request('/api/voice/unheard', {
        method: 'POST',
        headers: { cookie: headers.get('cookie') ?? '', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    expect((await report({ contextState: 'running', rebuilt: true, waitedMs: 2100 })).status).toBe(
      204,
    )
    expect((await report({ contextState: 'running', rebuilt: 'yes', waitedMs: -1 })).status).toBe(
      400,
    )
    const anonymous = await t.request('/api/voice/unheard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contextState: 'running', rebuilt: false, waitedMs: 1 }),
    })
    expect(anonymous.status).toBe(401)
  })

  it('counts a whole recording towards the day, not the parts heard while talking', async () => {
    heard = '换尿布'
    const before = await day()
    await hear(32_000, 'zh-CN&partial=1')
    expect(await day()).toBe(before)
    await hear(32_000, 'zh-CN')
    expect(await day()).toBe((before ?? 0) + 1)
  })

  it('streams the answer, corrected first by the user’s own model', async () => {
    let own = ''
    corrected = '小米力今天怎么样。'
    fake.setResponses([
      ({ request }) => {
        own = JSON.stringify(request.systemPrompts ?? [])
        return { text: '小米粒今天怎么样' }
      },
      { text: '今天一切都好。' },
    ])
    const res = await t.request('/api/voice/chat', {
      method: 'POST',
      headers: {
        cookie: headers.get('cookie') ?? '',
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ text: '小米力今天怎么样', spoken: true, recent: ['还有吗？'] }),
    })
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/)
    const sent = [...(await res.text()).matchAll(/event: (\w+)\ndata: (.*)\n/g)].map(
      ([, event, data]) => ({ event, data: JSON.parse(data ?? 'null') as unknown }),
    )
    expect(sent[0]).toEqual({ event: 'heard', data: { text: '小米粒今天怎么样' } })
    expect(sent.some(({ event }) => event === 'text')).toBe(true)
    expect(sent.at(-1)).toEqual({
      event: 'done',
      data: { reply: '今天一切都好。', done: false, confirming: false },
    })
    // Both models knew the babies and the conversation; the user's own answered in time, so
    // its correction won over the quick one's.
    expect(own).toContain('小米粒')
    expect(own).toContain('还有吗？')
    expect(correction).toContain('<transcription>小米力今天怎么样</transcription> /no_think')
    corrected = null
    const chat = await t.request('/api/voice/chat', { headers })
    const { lines } = (await chat.json()) as { lines: Array<{ role: string; text: string }> }
    expect(lines.at(-2)).toMatchObject({ role: 'user', text: '小米粒今天怎么样' })
  })

  it('falls back to the quick model when the user’s own fails to correct', async () => {
    corrected = '<think>\n</think>\n大概三点半开始睡觉。'
    fake.setResponses([
      () => {
        throw new Error('Provider down')
      },
      { text: '好的。' },
    ])
    const res = await t.request('/api/voice/chat', {
      method: 'POST',
      headers: {
        cookie: headers.get('cookie') ?? '',
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ text: '大三年半开始睡觉', spoken: true }),
    })
    expect(await res.text()).toContain('"text":"大概三点半开始睡觉。"')
    corrected = null
  })

  it('takes a message whose recent lines are long, using only their start', async () => {
    fake.setResponses([{ text: '换尿布了。' }, { text: '好。' }])
    const long = `Assistant: ${'今天喝奶五次。'.repeat(60)}`
    const res = await t.request('/api/voice/chat', {
      method: 'POST',
      headers: {
        cookie: headers.get('cookie') ?? '',
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        text: '换尿布了',
        spoken: true,
        recent: ['User: 一', 'Assistant: 二', 'User: 三', long, 'User: 五'],
      }),
    })
    expect(res.status).toBe(200)
    await res.text()
    expect(correction).toContain('User: 五')
    expect(correction).not.toContain('User: 一')
    expect(correction).not.toContain(long)
  })

  it('pages through the last 30 days of conversations, newest first', async () => {
    const reader = await t.signIn('翻记录')
    const prefix = `voice_${reader.user.id}_`
    const now = Date.now()
    const thread = (minutesAgo: number, name: string, count: number) => {
      const at = now - minutesAgo * 60_000
      const messages = Array.from({ length: count }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `${name}${i}`,
      }))
      // Tool calls and results are not shown.
      messages.splice(1, 0, { role: 'tool', content: 'tool result' })
      return t.env.DB.prepare(
        'insert into chat_threads (thread_id, messages_json, updated_at) values (?, ?, ?)',
      ).bind(`${prefix}${newId(at)}`, JSON.stringify(messages), at)
    }
    await t.env.DB.batch([
      thread(40 * 24 * 60, 'old', 4),
      thread(5 * 24 * 60, 'b', 12),
      thread(60, 'c', 6),
    ])
    type Page = {
      lines: Array<{ text: string; threadId: string }>
      threads: Record<string, { startedAt: number }>
      next: string | null
      activeThreadId: string | null
    }
    const page = async (before?: string): Promise<Page> =>
      (
        await t.request(`/api/voice/chat${before ? `?before=${before}` : ''}`, {
          headers: reader.headers,
        })
      ).json()

    const first = await page()
    expect(first.lines.map((line) => line.text)).toEqual([
      'b8',
      'b9',
      'b10',
      'b11',
      'c0',
      'c1',
      'c2',
      'c3',
      'c4',
      'c5',
    ])
    expect(Object.keys(first.threads)).toHaveLength(2)
    expect(first.activeThreadId).toBeNull()
    const earlier = await page(first.next ?? '')
    expect(earlier.lines.map((line) => line.text)).toEqual(
      Array.from({ length: 8 }, (_, i) => `b${i}`),
    )
    // Nothing older than 30 days.
    expect(earlier.next).toBeNull()
  })

  it('asks before deleting and waits for yes', async () => {
    const [stored] = await events()
    fake.setResponses([{ toolCalls: [{ name: 'delete_event', input: { id: stored?.id } }] }])
    const ask = await t.send('POST', '/api/voice/chat', headers, { text: '删掉刚才那条' })
    expect(await ask.json()).toMatchObject({
      confirming: true,
      reply: expect.stringMatching(/^要删除/),
    })
    const before = (await events()).length
    // The model reads the answer first.
    fake.setResponses([{ text: '{"answer":"yes"}' }, { text: '删掉了。' }])
    await t.send('POST', '/api/voice/chat', headers, { text: '确定' })
    expect(await events()).toHaveLength(before - 1)
  })

  it('stops working when revoked or replaced', async () => {
    const first = await newToken()
    const second = await newToken()
    expect(await works(first.token)).toBe(false)
    // Revoking an old id (a device signing out) leaves the current code alone.
    await t.send('DELETE', `/api/voice/tokens/${first.id}`, headers)
    expect(await works(second.token)).toBe(true)
    await t.send('DELETE', '/api/voice/token', headers)
    expect(await works(second.token)).toBe(false)
  })

  it('stops working when the password changes', async () => {
    const parent = await t.signIn('爸爸')
    await newFamily(parent.headers, '爸爸家', '小核桃')
    await t.saveAi(parent.headers, KEY)
    const ctx = await t.auth.$context
    const userId = parent.user.id
    await ctx.internalAdapter.linkAccount({
      userId,
      providerId: 'credential',
      accountId: userId,
      password: 'old',
    })
    const { token } = await newToken(parent.headers)
    fake.setResponses([{ text: '你好。' }])
    expect((await answerOf(await siri(token, '你好'))).ok).toBe(true)
    await ctx.internalAdapter.updatePassword(userId, 'new')
    expect((await answerOf(await siri(token, '你好'))).reply).toMatch(/口令已失效/)
  })

  it('records in every family with your own key, telling same names apart', async () => {
    const grandma = await t.signIn('外婆')
    const other = await newFamily(grandma.headers, '外婆家', '小豆子')
    await t.send('POST', '/api/sync/push', grandma.headers, {
      babies: [baby(other, { name: '小米粒' })],
      events: [],
    })
    await join(grandma.headers, other, headers)
    const { token } = await newToken()

    await record(token, '小豆子换尿布', [action({ type: 'diaper', baby: '小豆子' })])
    expect(system).toContain('小米粒（我们家）')
    expect(system).toContain('小米粒（外婆家）')
    expect((await events(grandma.headers)).filter((e) => e.type === 'diaper')).toHaveLength(1)

    const which = await record(token, '小米粒换尿布', [action({ type: 'diaper', baby: '小米粒' })])
    expect(which.ok).toBe(true)
    expect((await events(grandma.headers)).filter((e) => e.type === 'diaper')).toHaveLength(1)
    await record(token, '外婆家的小米粒换尿布', [
      action({ type: 'diaper', baby: '小米粒（外婆家）' }),
    ])
    expect((await events(grandma.headers)).filter((e) => e.type === 'diaper')).toHaveLength(2)
  })

  it('without a key of your own, records only in the family that shared one', async () => {
    const aunt = await t.signIn('阿姨')
    await join(headers, familyId, aunt.headers)
    const grandma = await t.signIn('奶奶')
    const theirs = await newFamily(grandma.headers, '奶奶家', '小橙子')
    await join(grandma.headers, theirs, aunt.headers)
    // Grandma's family is joined later but is the only one with a shared AI.
    await t.saveAi(grandma.headers, 'sk-or-v1-grandma-key')
    await t.send('PUT', '/api/ai/shares', grandma.headers, { familyIds: [theirs] })

    const settings = await (await t.request('/api/voice', { headers: aunt.headers })).json()
    expect(settings).toMatchObject({ ai: { kind: 'shared', familyName: '奶奶家', by: '奶奶' } })
    const { token } = await newToken(aunt.headers)
    const ours = (await events()).length
    await record(token, '小米粒换尿布', [action({ type: 'diaper', baby: '小米粒' })])
    expect(usedKey).toMatch(/-key$/)
    expect(system).not.toContain('小米粒')
    expect(system).toContain('只能记这个家庭')
    expect(await events()).toHaveLength(ours)
    await record(token, '小橙子换尿布', [action({ type: 'diaper', baby: '小橙子' })])
    expect((await events(grandma.headers)).filter((e) => e.type === 'diaper')).toHaveLength(1)
  })

  it('forgets the conversations when the account is deleted', async () => {
    const parent = await t.signIn('舅舅')
    await newFamily(parent.headers, '舅舅家', '小葡萄')
    await t.saveAi(parent.headers, KEY)
    fake.setResponses([{ text: '你好。' }])
    await t.send('POST', '/api/voice/chat', parent.headers, { text: '你好' })
    const count = async () =>
      (
        await t.env.DB.prepare('select count(*) as n from chat_threads where thread_id like ?')
          .bind(`voice_${parent.user.id}_%`)
          .first<{ n: number }>()
      )?.n
    expect(await count()).toBe(1)
    await t.send('DELETE', '/api/account', parent.headers)
    expect(await count()).toBe(0)
  })

  it('answers viewers that there is nothing to record', async () => {
    const viewer = await t.signIn('邻居')
    await join(headers, familyId, viewer.headers, 'viewer')
    const { token } = await newToken(viewer.headers)
    expect((await answerOf(await siri(token, '换尿布'))).reply).toBe('还没有可以记录的家庭。')
  })
})

describe('clock times', () => {
  const now = Date.UTC(2026, 9, 17, 2, 0) // 10:00 in Shanghai
  it('reads clock times in the user zone, yesterday if still ahead', () => {
    expect(clockToTime('09:30', now, 'Asia/Shanghai')).toBe(Date.UTC(2026, 9, 17, 1, 30))
    expect(clockToTime('23:00', now, 'Asia/Shanghai')).toBe(Date.UTC(2026, 9, 16, 15, 0))
    expect(clockToTime('25:00', now, 'Asia/Shanghai')).toBeNull()
  })
})
