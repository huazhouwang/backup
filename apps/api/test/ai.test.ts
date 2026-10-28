import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { decryptKey } from '../src/ai/key-crypto'
import { MAX_OUTPUT_TOKENS, modelOptionsFor } from '../src/ai/providers'
import { createTestApp } from './app'

const SECRET = 'test-ai-key-secret-test-ai-key-secret'
const KEY = 'sk-or-v1-abcdefghijklmnop1234'
const OPENAI_KEY = 'sk-proj-abcdefghijklmnopwxyz'

/** OpenRouter and OpenAI as the server sees them: a key check, then the model list. */
function fakeProviders(valid = true) {
  return vi.fn<(input: string) => Promise<Response>>(async (url) => {
    if (url.endsWith('/key')) return new Response('{}', { status: valid ? 200 : 401 })
    if (url.startsWith('https://api.openai.com')) {
      if (!valid) return new Response('{}', { status: 401 })
      return Response.json({
        data: [{ id: 'gpt-5.4-mini' }, { id: 'gpt-5.4-pro' }, { id: 'tts-1' }],
      })
    }
    return Response.json({
      data: [
        { id: 'zeta/model', supported_parameters: ['tools'] },
        {
          id: 'openai/gpt-5.4-mini',
          supported_parameters: ['tools'],
          pricing: { prompt: '0.00000075', completion: '0.0000045' },
        },
        {
          id: 'deepseek/deepseek-v4.1-flash',
          supported_parameters: ['tools'],
          pricing: { prompt: '0.00000004', completion: '0.000000144' },
        },
        { id: 'deepseek/deepseek-v4.1-flash-1017', supported_parameters: ['tools'] },
        { id: 'deepseek/deepseek-v4.1-flash:batch', supported_parameters: ['tools'] },
        { id: '~deepseek/deepseek-flash-latest', supported_parameters: ['tools'] },
        { id: 'deepseek/deepseek-r1', supported_parameters: ['tools'] },
        {
          id: 'big/model',
          supported_parameters: ['tools'],
          pricing: { prompt: '0.0000025', completion: '0.000015' },
        },
        { id: 'old/model', supported_parameters: ['structured_outputs'] },
      ],
    })
  })
}

describe('AI settings', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>
  let owner: Headers
  let familyId: string
  const mine = async (headers = owner): Promise<unknown> =>
    (await t.request('/api/ai', { headers })).json()
  const addKey = (provider: string, apiKey: string, headers = owner) =>
    t.send('PUT', `/api/ai/keys/${provider}`, headers, { apiKey })
  const cipher = async (provider: string) =>
    (
      await t.env.DB.prepare('select key_cipher as c from user_ai_keys where provider = ?')
        .bind(provider)
        .first<{ c: string }>()
    )?.c ?? ''
  const family = async (headers = owner): Promise<unknown> =>
    (await t.request(`/api/families/${familyId}/ai`, { headers })).json()

  beforeAll(async () => {
    t = await createTestApp({ ENCRYPTION_SECRET: SECRET })
    owner = (await t.signIn()).headers
    const res = await t.send('POST', '/api/families', owner, { name: '我们家' })
    const created: { id: string } = await res.json()
    familyId = created.id
  })
  afterAll(() => t.dispose())
  afterEach(() => vi.unstubAllGlobals())

  it('starts empty', async () => {
    expect(await mine()).toEqual({ keys: [], choice: null, sharedFamilyIds: [] })
    expect(await family()).toEqual({ inUse: null, shares: [] })
  })

  it('rejects a bad key without saving it', async () => {
    vi.stubGlobal('fetch', fakeProviders(false))
    expect((await addKey('openrouter', KEY)).status).toBe(400)
    expect(await mine()).toMatchObject({ keys: [], choice: null })
  })

  it('checks and stores the key encrypted, picking the first recommended model', async () => {
    vi.stubGlobal('fetch', fakeProviders())
    expect(await (await addKey('openrouter', KEY)).json()).toEqual({
      keys: [{ provider: 'openrouter', keyHint: 'sk-or-…1234' }],
      choice: { provider: 'openrouter', model: 'deepseek/deepseek-v4.1-flash' },
      sharedFamilyIds: [],
    })
    expect(await cipher('openrouter')).not.toContain(KEY)
    expect(await decryptKey(SECRET, await cipher('openrouter'))).toBe(KEY)
  })

  it('keeps a key per provider, and the model in use when adding another', async () => {
    vi.stubGlobal('fetch', fakeProviders())
    expect(await (await addKey('openai', OPENAI_KEY)).json()).toMatchObject({
      keys: [
        { provider: 'openai', keyHint: 'sk-…wxyz' },
        { provider: 'openrouter', keyHint: 'sk-or-…1234' },
      ],
      choice: { provider: 'openrouter', model: 'deepseek/deepseek-v4.1-flash' },
    })
    expect(await decryptKey(SECRET, await cipher('openrouter'))).toBe(KEY)
  })

  it("lists every key's models with prices, recommended first, hiding the unusual", async () => {
    vi.stubGlobal('fetch', fakeProviders())
    const res = await t.request('/api/ai/models', { headers: owner })
    expect(await res.json()).toEqual({
      providers: [
        {
          provider: 'openai',
          status: 'ok',
          models: [
            { id: 'gpt-5.4-mini', tag: 'steady', everyday: true },
            { id: 'gpt-5.4-pro', everyday: false },
          ],
        },
        {
          provider: 'openrouter',
          status: 'ok',
          models: [
            {
              id: 'deepseek/deepseek-v4.1-flash',
              tag: 'cheapest',
              price: { input: 0.04, output: 0.144 },
              everyday: true,
            },
            {
              id: 'openai/gpt-5.4-mini',
              tag: 'steady',
              price: { input: 0.75, output: 4.5 },
              everyday: true,
            },
            { id: '~deepseek/deepseek-flash-latest', everyday: false },
            { id: 'big/model', price: { input: 2.5, output: 15 }, everyday: false },
            { id: 'deepseek/deepseek-r1', everyday: false },
            { id: 'deepseek/deepseek-v4.1-flash-1017', everyday: false },
            { id: 'deepseek/deepseek-v4.1-flash:batch', everyday: false },
            { id: 'zeta/model', everyday: true },
          ],
        },
      ],
    })
  })

  it('says which key stopped working instead of failing the list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.startsWith('https://api.openai.com')
          ? new Response('{}', { status: 401 })
          : fakeProviders()(url),
      ),
    )
    const res = await t.request('/api/ai/models', { headers: owner })
    const { providers } = (await res.json()) as { providers: { status: string }[] }
    expect(providers.map((entry) => entry.status)).toEqual(['invalid', 'ok'])
  })

  it('picks a model only for a provider with a key', async () => {
    const res = await t.send('PUT', '/api/ai', owner, { provider: 'openai', model: 'gpt-5.4-mini' })
    expect(await res.json()).toMatchObject({
      choice: { provider: 'openai', model: 'gpt-5.4-mini' },
    })
    const other = (await t.signIn('没有 key')).headers
    const denied = await t.send('PUT', '/api/ai', other, {
      provider: 'openai',
      model: 'gpt-5.4-mini',
    })
    expect(denied.status).toBe(400)
  })

  it('removing the key in use clears the model and keeps the other key', async () => {
    const res = await t.send('DELETE', '/api/ai/keys/openai', owner)
    expect(await res.json()).toEqual({
      keys: [{ provider: 'openrouter', keyHint: 'sk-or-…1234' }],
      choice: null,
      sharedFamilyIds: [],
    })
    await t.send('PUT', '/api/ai', owner, { provider: 'openrouter', model: 'openai/gpt-5.4-mini' })
  })

  it('shares with families the user is in, and families pick whose to use', async () => {
    const res = await t.send('PUT', '/api/ai/shares', owner, { familyIds: [familyId] })
    expect(await res.json()).toMatchObject({ sharedFamilyIds: [familyId] })
    const outside = await t.send('PUT', '/api/ai/shares', owner, {
      familyIds: ['01J00000000000000000000000'],
    })
    expect(outside.status).toBe(403)

    // A second member shares too; the earliest stays in use until a manager picks.
    const aunt = await t.signIn('阿姨')
    const invite = await t.send('POST', `/api/families/${familyId}/invites`, owner, {
      role: 'caregiver',
      babyIds: null,
    })
    const { code } = (await invite.json()) as { code: string }
    await t.send('POST', `/api/invites/${code}/accept`, aunt.headers)
    await t.saveAi(aunt.headers, KEY)
    await t.send('PUT', '/api/ai/shares', aunt.headers, { familyIds: [familyId] })
    const shared = (await family(aunt.headers)) as { inUse: string; shares: { name: string }[] }
    expect(shared.shares.map((share) => share.name)).toEqual(['测试家长', '阿姨'])
    expect(shared.inUse).not.toBe(aunt.user.id)

    const denied = await t.send('PUT', `/api/families/${familyId}/ai`, aunt.headers, {
      userId: aunt.user.id,
    })
    expect(denied.status).toBe(403)
    const picked = await t.send('PUT', `/api/families/${familyId}/ai`, owner, {
      userId: aunt.user.id,
    })
    expect(await picked.json()).toMatchObject({ inUse: aunt.user.id })

    // Leaving the family ends the share.
    await t.send('DELETE', `/api/families/${familyId}/members/${aunt.user.id}`, aunt.headers)
    expect(await family()).toMatchObject({ shares: [{ name: '测试家长' }] })
  })

  it('removing the last key ends its shares', async () => {
    await t.send('DELETE', '/api/ai/keys/openrouter', owner)
    expect(await mine()).toEqual({ keys: [], choice: null, sharedFamilyIds: [] })
    expect(await family()).toEqual({ inUse: null, shares: [] })
  })
})

describe('model request options', () => {
  // Without a cap, OpenRouter reserves the model's maximum output and refuses small balances.
  it('caps output tokens under the name each API uses', () => {
    expect(modelOptionsFor('openrouter', 'deepseek/deepseek-v4.1-flash')).toEqual({
      max_tokens: MAX_OUTPUT_TOKENS,
      provider: { require_parameters: true },
    })
    expect(modelOptionsFor('openai', 'gpt-4.1-mini')).toEqual({
      max_output_tokens: MAX_OUTPUT_TOKENS,
    })
  })

  // GPT-5 without a reasoning effort writes its plan into the reply, and Siri reads it out.
  it('asks OpenAI reasoning models for low effort, directly or through OpenRouter', () => {
    expect(modelOptionsFor('openai', 'gpt-5.4-mini')).toEqual({
      max_output_tokens: MAX_OUTPUT_TOKENS,
      reasoning: { effort: 'low' },
    })
    expect(modelOptionsFor('openrouter', 'openai/gpt-5.4-mini')).toMatchObject({
      reasoning: { effort: 'low' },
    })
    expect(modelOptionsFor('openai', 'o4-mini')).toHaveProperty('reasoning')
  })
})
