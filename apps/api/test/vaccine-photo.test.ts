import type { BookletDose } from '@lullabo/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  type BookletInput,
  BookletReadError,
  bookletPrompt,
  parseReading,
  visionModelFor,
} from '../src/vaccine-photo'
import { createTestApp } from './app'
import { baby } from './fixtures'

const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='

describe('reading a vaccination booklet photo', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>
  let headers: Headers
  let babyId: string
  let read: BookletInput | null = null
  let answer: BookletDose[] | Error = []

  const send = (h = headers, body: object = { babyId, region: 'cn', image: PHOTO }) =>
    t.send('POST', '/api/vaccines/read', h, body)

  beforeAll(async () => {
    t = await createTestApp(
      { ENCRYPTION_SECRET: 'test-ai-key-secret-test-ai-key-secret' },
      {
        bookletReader: async (input) => {
          read = input
          if (answer instanceof Error) throw answer
          return answer
        },
      },
    )
    headers = (await t.signIn()).headers
    const { id: familyId } = (await (
      await t.send('POST', '/api/families', headers, { name: '我们家' })
    ).json()) as { id: string }
    const newBaby = baby(familyId, { birthDate: '2026-05-20' })
    babyId = newBaby.id
    await t.send('POST', '/api/sync/push', headers, { babies: [newBaby], events: [] })
  })
  afterAll(() => t.dispose())

  it('needs the family’s AI', async () => {
    const res = await send()
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'no_key' })
  })

  it('reads it with the AI picked, for the baby and the region asked', async () => {
    await t.saveAi(headers, 'sk-or-v1-0123456789')
    answer = [{ vaccineId: 'hepb', name: '乙肝', dose: 1, date: '2026-05-21' }]
    const res = await send()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ doses: answer })
    expect(read).toMatchObject({
      provider: 'openrouter',
      model: 'openai/gpt-5.4-mini',
      apiKey: 'sk-or-v1-0123456789',
      image: PHOTO,
      region: 'cn',
      birthDate: '2026-05-20',
    })
  })

  it('says so when the AI couldn’t read it', async () => {
    answer = new BookletReadError('no reply')
    const res = await send()
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'unreadable' })
    answer = []
  })

  it('is only for those who can record for the baby, and only takes images', async () => {
    const stranger = (await t.signIn('路人')).headers
    expect((await send(stranger)).status).toBe(404)
    expect(
      (await send(headers, { babyId, region: 'cn', image: 'data:text/plain;base64,aGk=' })).status,
    ).toBe(400)
  })
})

const reply = (doses: unknown) => ({
  choices: [{ message: { content: JSON.stringify({ doses }) } }],
})

describe('the booklet reading', () => {
  const at = { region: 'cn' as const, birthDate: '2026-05-20' }

  it('keeps doses on the schedule, and names the rest for the family', () => {
    const doses = parseReading(
      reply([
        { vaccineId: 'hepb', name: '乙肝', dose: 2, date: '2026-06-20' },
        { vaccineId: 'rabies', name: '狂犬病疫苗', dose: 1, date: '2026-07-01' },
        // A fourth dose of a three-dose vaccine is not the schedule's.
        { vaccineId: 'hepb', name: '乙肝', dose: 4, date: '2026-08-01' },
      ]),
      at,
    )
    expect(doses).toEqual([
      { vaccineId: 'hepb', name: '乙肝', dose: 2, date: '2026-06-20' },
      { vaccineId: null, name: '狂犬病疫苗', dose: 1, date: '2026-07-01' },
      { vaccineId: null, name: '乙肝', dose: 4, date: '2026-08-01' },
    ])
  })

  it('leaves out what can’t be: before birth, in the future, or malformed', () => {
    const doses = parseReading(
      reply([
        { vaccineId: 'bcg', name: '卡介苗', dose: 1, date: '2026-05-19' },
        { vaccineId: 'bcg', name: '卡介苗', dose: 1, date: '2999-01-01' },
        { vaccineId: 'bcg', name: '卡介苗', dose: 0, date: '2026-05-21' },
        { vaccineId: 'bcg', name: '卡介苗', dose: 1, date: '2026/05/21' },
      ]),
      at,
    )
    expect(doses).toEqual([])
    expect(() => parseReading({ choices: [] }, at)).toThrow(BookletReadError)
    expect(() => parseReading({ choices: [{ message: { content: 'sorry' } }] }, at)).toThrow(
      BookletReadError,
    )
  })

  it('uses the model picked if it sees images, else one of the same provider that does', () => {
    expect(visionModelFor('openrouter', 'openai/gpt-5.4-nano')).toBe('openai/gpt-5.4-nano')
    expect(visionModelFor('openrouter', 'google/gemini-3-flash')).toBe('google/gemini-3-flash')
    expect(visionModelFor('openrouter', 'deepseek/deepseek-v4.1-flash')).toBe('openai/gpt-5.4-mini')
    expect(visionModelFor('openai', 'gpt-5.4-nano')).toBe('gpt-5.4-nano')
  })

  it('tells the model the region’s schedule and how it writes dates', () => {
    const us = bookletPrompt('us', '2026-05-20')
    expect(us).toContain('us-dtap | 百白破疫苗 | DTaP')
    expect(us).toContain('month first')
    expect(us).toContain('born on 2026-05-20')
    expect(bookletPrompt('gb', '2026-05-20')).toContain('day first')
  })
})
