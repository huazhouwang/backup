import type { Event, PullResponse } from '@lullabo/shared'
import { fakeText } from '@tanstack/ai/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadAccess } from '../src/access'
import { runAgent } from '../src/agent/run'
import type { AgentScope } from '../src/agent/scope'
import { SESSION_IDLE_MS } from '../src/agent/threads'
import { createTestApp } from './app'
import { baby } from './fixtures'

const diaper = {
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
}

describe('voice agent', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>
  let headers: Headers
  let scope: AgentScope
  const fake = fakeText()
  const NOW = Date.UTC(2026, 9, 17, 2, 0)
  /** After the other tests' conversations have gone idle, still the same day. */
  const LATER = NOW + 2 * SESSION_IDLE_MS + 400_000

  const events = async () => {
    const res = await t.request('/api/sync/pull?cursor=', { headers })
    const page = (await res.json()) as PullResponse
    return page.events.filter((event: Event) => event.deletedAt === null)
  }
  const bottles = async () =>
    (await events()).filter((event) => event.type === 'feeding').map((event) => event.data)

  beforeAll(async () => {
    t = await createTestApp()
    const signedIn = await t.signIn()
    headers = signedIn.headers
    const res = await t.send('POST', '/api/families', headers, { name: '我们家' })
    const family: { id: string } = await res.json()
    await t.send('POST', '/api/sync/push', headers, {
      babies: [baby(family.id, { name: '小米粒' })],
      events: [],
    })
    const access = await loadAccess(t.env.DB, signedIn.user.id)
    scope = {
      db: t.env.DB,
      access,
      families: [access.get(family.id)!],
      sharedOnly: false,
      keyScope: 'own',
      userId: signedIn.user.id,
      timeZone: 'Asia/Shanghai',
      locale: 'zh-CN',
      phrase: '记录宝宝',
    }
  })
  afterAll(() => t.dispose())

  it('records through the record tool, answers without another model call, and remembers', async () => {
    // One model call: once the record is saved, its summary is the answer.
    fake.setResponses([
      { toolCalls: [{ name: 'record', input: { actions: [diaper], confirmed: false } }] },
    ])
    const turn = await runAgent(fake, scope, '换尿布了', NOW)
    expect(turn).toMatchObject({ done: false, confirming: false })
    expect(turn.reply).toMatch(/^已记录：小米粒 \d\d:\d\d 换尿布（尿尿）。还有吗？$/)
    expect((await events()).map((event) => event.type)).toEqual(['diaper'])

    let seen = 0
    fake.setResponses([
      ({ request }) => {
        seen = request.messages.length
        return { toolCalls: [{ name: 'end_conversation', input: {} }] }
      },
      { text: '好的，再见。' },
    ])
    const end = await runAgent(fake, scope, '没有了', NOW + 60_000)
    expect(end).toMatchObject({ done: true, reply: '好的，再见。' })
    // The earlier turn (message, tool call, result, answer) came along.
    expect(seen).toBeGreaterThan(3)
  })

  it('asks before deleting, and deletes on yes', async () => {
    const [stored] = await events()
    fake.setResponses([{ toolCalls: [{ name: 'delete_event', input: { id: stored?.id } }] }])
    const ask = await runAgent(fake, scope, '删掉刚才那条', NOW + 120_000)
    expect(ask.confirming).toBe(true)
    expect(ask.reply).toMatch(/^要删除「小米粒 \d\d:\d\d 换尿布（尿尿）」吗？$/)
    expect(await events()).toHaveLength(1)

    // The model reads the answer, in whatever words, then the change goes ahead.
    let asked = ''
    fake.setResponses([
      ({ request }) => {
        asked = JSON.stringify(request.messages)
        return { text: '{"answer":"yes"}' }
      },
    ])
    const done = await runAgent(fake, scope, 'yeah go ahead', NOW + 150_000)
    expect(asked).toContain('要删除「小米粒')
    expect(asked).toContain('yeah go ahead')
    expect(done.reply).toMatch(/^已删除：小米粒 \d\d:\d\d 换尿布（尿尿）。还有吗？$/)
    expect(await events()).toHaveLength(0)
  })

  it('keeps the record when the user says no', async () => {
    fake.setResponses([
      { toolCalls: [{ name: 'record', input: { actions: [diaper], confirmed: false } }] },
      { text: '记好了。' },
    ])
    await runAgent(fake, scope, '换尿布了', NOW + 200_000)
    const [stored] = await events()
    fake.setResponses([{ toolCalls: [{ name: 'delete_event', input: { id: stored?.id } }] }])
    await runAgent(fake, scope, '删掉', NOW + 210_000)
    fake.setResponses([{ text: '{"answer":"no"}' }, { text: '好，不删。' }])
    const kept = await runAgent(fake, scope, '算了不删了', NOW + 220_000)
    expect(kept.reply).toBe('好，不删。')
    expect(await events()).toHaveLength(1)
  })

  it('takes a correction instead of an answer as a new message', async () => {
    const [stored] = await events()
    fake.setResponses([{ toolCalls: [{ name: 'delete_event', input: { id: stored?.id } }] }])
    await runAgent(fake, scope, '删掉', NOW + 224_000)
    fake.setResponses([
      { text: '{"answer":"other"}' },
      { text: '好，不删。' },
      { text: '记住了，是早上的。' },
    ])
    const turn = await runAgent(fake, scope, '不是这条，是早上那条', NOW + 226_000)
    expect(turn.reply).toBe('记住了，是早上的。')
    expect(await events()).toHaveLength(1)
  })

  it('gives up when the model takes longer than the turn may', async () => {
    fake.setResponses([
      async () => {
        await new Promise((done) => setTimeout(done, 300))
        return { text: '太晚了。' }
      },
    ])
    const turn = await runAgent(fake, { ...scope, timeoutMs: 50 }, '你好', NOW + 228_000)
    expect(turn).toEqual({ reply: '没处理好，请再说一遍。', done: false, confirming: false })
  })

  it('never says a tool call the model wrote as text', async () => {
    fake.setResponses([
      {
        text: '<｜DSML｜invoke name="update_event"><｜DSML｜parameter name="id">x</｜DSML｜parameter>',
      },
    ])
    const turn = await runAgent(fake, scope, '改一下', NOW + 230_000)
    expect(turn).toEqual({ reply: '没处理好，请再说一遍。', done: false, confirming: false })
  })

  it('undoes the last change', async () => {
    fake.setResponses([
      { toolCalls: [{ name: 'record', input: { actions: [diaper], confirmed: false } }] },
      { text: '记好了。' },
    ])
    await runAgent(fake, scope, '又换了尿布', NOW + 300_000)
    expect(await events()).toHaveLength(2)
    fake.setResponses([{ toolCalls: [{ name: 'undo', input: {} }] }, { text: '撤销了。' }])
    await runAgent(fake, scope, '撤销', NOW + 310_000)
    expect(await events()).toHaveLength(1)
  })

  it('deletes only the record it asked about when the model asks to delete two', async () => {
    fake.setResponses([
      { toolCalls: [{ name: 'record', input: { actions: [diaper, diaper], confirmed: false } }] },
      { text: '记好了。' },
    ])
    await runAgent(fake, scope, '换了两次尿布', NOW + 312_000)
    const [first, second] = (await events()).toSorted((a, b) => a.createdAt - b.createdAt).slice(-2)
    fake.setResponses([
      {
        toolCalls: [
          { name: 'delete_event', input: { id: first?.id } },
          { name: 'delete_event', input: { id: second?.id } },
        ],
      },
    ])
    const ask = await runAgent(fake, scope, '把这两条删了', NOW + 314_000)
    expect(ask.confirming).toBe(true)
    fake.setResponses([{ text: '{"answer":"yes"}' }, { text: '删掉了一条。' }])
    await runAgent(fake, scope, '是', NOW + 316_000)
    const left = (await events()).map((event) => event.id)
    expect(left).not.toContain(first?.id)
    expect(left).toContain(second?.id)
  })

  it('changes a record at once and says what changed', async () => {
    const [stored] = await events()
    fake.setResponses([
      {
        toolCalls: [
          {
            name: 'update_event',
            input: {
              id: stored?.id,
              time: null,
              endTime: null,
              durationMinutes: null,
              amountMl: null,
              milk: null,
              breastMl: null,
              formulaMl: null,
              diaper: 'dirty',
              food: null,
              celsius: null,
              note: null,
              confirmed: false,
            },
          },
        ],
      },
    ])
    const turn = await runAgent(fake, scope, '刚才那条是便便', NOW + 320_000)
    expect(turn).toMatchObject({ done: false, confirming: false })
    expect(turn.reply).toMatch(/^已修改：.*尿尿.*→.*便便.*。还有吗？$/)
    expect((await events()).find((event) => event.id === stored?.id)).toMatchObject({
      data: { contents: 'dirty' },
    })
  })

  it('starts a new conversation after a pause', async () => {
    let seen = 0
    fake.setResponses([
      ({ request }) => {
        seen = request.messages.length
        return { text: '你好。' }
      },
    ])
    await runAgent(fake, scope, '你好', NOW + 320_000 + SESSION_IDLE_MS + 1)
    expect(seen).toBe(1)
  })

  it("tells the model each baby's age, what is usual for it, and its own habits", async () => {
    let prompt = ''
    fake.setResponses([
      ({ request }) => {
        prompt = JSON.stringify(request.systemPrompts)
        return { text: '你好。' }
      },
    ])
    await runAgent(fake, scope, '你好', LATER)
    expect(prompt).toContain('小米粒：出生 17 天。')
    expect(prompt).toContain('瓶喂每次 30–120 毫升')
    expect(prompt).toContain('confirmed: true')
  })

  it('answers parenting questions from the tips, with the one the parent came from', async () => {
    let prompt = ''
    let read = ''
    fake.setResponses([
      ({ request }) => {
        prompt = JSON.stringify(request.systemPrompts)
        return {
          toolCalls: [{ name: 'read_tips', input: { ids: ['safe-sleep'], baby: '小米粒' } }],
        }
      },
      ({ request }) => {
        read = JSON.stringify(request.messages.at(-1))
        return { text: '每次都让宝宝仰着睡。' }
      },
    ])
    const turn = await runAgent(fake, { ...scope, tip: 'safe-sleep' }, '具体可以怎么做？', LATER)
    expect(turn.reply).toBe('每次都让宝宝仰着睡。')
    // Every tip is listed, and the one the parent came from is there in full.
    expect(prompt).toContain('newborn-feeding：按需喂养')
    expect(prompt).toContain('家长是从这条贴士点进来问的')
    expect(prompt).toContain('每次睡觉都让宝宝仰面躺下')
    // The tool gives the tip in full and the baby's stage.
    expect(read).toContain('每次睡觉都让宝宝仰面躺下')
    expect(read).toContain('第 3 周')
    // Nothing was recorded for a question.
    expect(await events()).not.toContainEqual(expect.objectContaining({ type: 'note' }))
  })

  it('asks before recording an amount that looks misheard, and records it once confirmed', async () => {
    const bottle = { ...diaper, type: 'bottle', amountMl: 500, milk: 'formula' }
    let result = ''
    fake.setResponses([
      { toolCalls: [{ name: 'record', input: { actions: [bottle], confirmed: false } }] },
      ({ request }) => {
        result = JSON.stringify(request.messages.at(-1))
        return { text: '是 50 毫升吗？' }
      },
    ])
    const asked = await runAgent(fake, scope, '喝了五百毫升奶粉', LATER + 1000)
    expect(asked.reply).toBe('是 50 毫升吗？')
    expect(result).toContain('可能听错了')
    expect(await bottles()).toEqual([])

    fake.setResponses([
      { toolCalls: [{ name: 'record', input: { actions: [bottle], confirmed: true } }] },
      { text: '好的，记了 500 毫升。还有吗？' },
    ])
    await runAgent(fake, scope, '对，就是五百', LATER + 2000)
    expect(await bottles()).toEqual([expect.objectContaining({ kind: 'bottle', amountMl: 500 })])
  })

  it('records a plausible amount without asking', async () => {
    const bottle = { ...diaper, type: 'bottle', amountMl: 60, milk: 'formula' }
    fake.setResponses([
      { toolCalls: [{ name: 'record', input: { actions: [bottle], confirmed: false } }] },
      { text: '记好了。还有吗？' },
    ])
    await runAgent(fake, scope, '喝了六十毫升奶粉', LATER + 3000)
    const amounts = (await events()).flatMap((event) =>
      event.type === 'feeding' && event.data.kind === 'bottle' ? [event.data.amountMl] : [],
    )
    expect(amounts).toContain(60)
  })

  it('changes how long a breastfeed took, moving its last side', async () => {
    const feed = { ...diaper, type: 'breast', leftMinutes: 10, rightMinutes: 10 }
    fake.setResponses([
      { toolCalls: [{ name: 'record', input: { actions: [feed], confirmed: false } }] },
      { text: '记好了。' },
    ])
    await runAgent(fake, scope, '左边十分钟右边十分钟', LATER + 4000)
    const stored = (await events()).find(
      (event) => event.type === 'feeding' && event.data.kind === 'breast',
    )
    const edit = {
      id: stored?.id,
      time: null,
      endTime: null,
      durationMinutes: 30,
      amountMl: null,
      milk: null,
      breastMl: null,
      formulaMl: null,
      diaper: null,
      food: null,
      celsius: null,
      note: null,
      confirmed: false,
    }
    fake.setResponses([
      { toolCalls: [{ name: 'update_event', input: edit }] },
      { text: '改好了。' },
    ])
    await runAgent(fake, scope, '其实喂了半个小时', LATER + 5000)
    const edited = (await events()).find((event) => event.id === stored?.id)
    if (edited?.type !== 'feeding' || edited.data.kind !== 'breast') throw new Error('gone')
    expect(edited.endAt).toBe(edited.startAt + 30 * 60_000)
    expect(edited.data.segments.map((segment) => (segment.endAt ?? 0) - segment.startAt)).toEqual([
      10 * 60_000,
      20 * 60_000,
    ])
  })
})
