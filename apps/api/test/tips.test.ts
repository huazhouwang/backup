import { fakeText } from '@tanstack/ai/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createTestApp } from './app'
import { baby, diaper } from './fixtures'

const DAY = 86_400_000

describe("Bobo's observation", () => {
  let t: Awaited<ReturnType<typeof createTestApp>>
  let headers: Headers
  let babyId: string
  let familyId: string
  const fake = fakeText()
  let prompt = ''

  const observation = (h = headers, id = babyId) =>
    t.request(`/api/tips/observation?babyId=${id}&timeZone=Asia%2FShanghai`, { headers: h })
  const log = (daysAgo: number[], perDay = 4) =>
    t.send('POST', '/api/sync/push', headers, {
      events: daysAgo.flatMap((ago) =>
        Array.from({ length: perDay }, (_, i) =>
          diaper(babyId, familyId, { startAt: Date.now() - ago * DAY - i * 3_600_000 }),
        ),
      ),
    })

  beforeAll(async () => {
    t = await createTestApp(
      { ENCRYPTION_SECRET: 'test-ai-key-secret-test-ai-key-secret' },
      { voiceAdapter: async () => fake },
    )
    headers = (await t.signIn()).headers
    const created = (await (
      await t.send('POST', '/api/families', headers, { name: '我们家' })
    ).json()) as {
      id: string
    }
    familyId = created.id
    const newBaby = baby(familyId, { name: '小米粒', birthDate: '2026-06-10' })
    babyId = newBaby.id
    await t.send('POST', '/api/sync/push', headers, { babies: [newBaby], events: [] })
  })
  afterAll(() => t.dispose())

  it('asks nothing of the model with too few days logged', async () => {
    await log([1, 2])
    expect(await (await observation()).json()).toMatchObject({ text: null, reason: 'sparse' })
    expect(fake.state.callCount).toBe(0)
  })

  it('needs an AI to write it', async () => {
    await log([3, 4])
    // One day with a single record: marked as probably not fully logged.
    await log([5], 1)
    expect(await (await observation()).json()).toMatchObject({ text: null, reason: 'noAi' })
  })

  it('writes it once a day, telling the model which days may be incomplete', async () => {
    await t.saveAi(headers, 'sk-or-v1-0123456789')
    fake.setResponses([
      ({ request }) => {
        prompt = JSON.stringify([request.systemPrompts, request.messages])
        return { text: '**这周**尿布换得很规律。' }
      },
    ])
    const first = (await (await observation()).json()) as { day: string; text: string }
    expect(first.text).toBe('这周尿布换得很规律。')
    expect(first.day).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(prompt).toContain('小米粒')
    expect(prompt).toContain('可能没记全')
    expect(prompt).toContain('没有记录')
    expect(prompt).toContain('绝不要从缺少的记录得出结论')
    // Kept for the day: no second model call.
    expect(await (await observation()).json()).toEqual(first)
    expect(fake.state.callCount).toBe(1)
  })

  it('is only for babies the user can see', async () => {
    const stranger = (await t.signIn('别人')).headers
    expect((await observation(stranger)).status).toBe(404)
    expect((await observation(headers, 'nope')).status).toBe(404)
  })
})
