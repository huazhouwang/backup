import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { type OutgoingEmail, sendEmail } from '../src/email'
import type { Env } from '../src/env'
import { hashPassword, verifyPassword } from '../src/password'
import { TEST_ORIGIN, createTestApp } from './app'

/** Stands in for the app's PBKDF2 output: 64 hex characters. */
const key = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')

const sent: OutgoingEmail[] = []
const codeFor = (email: string) => {
  const message = sent.findLast((item) => item.to === email)
  return /(\d{6})/.exec(message?.text ?? '')?.[1] ?? ''
}

/** Allows `limit` calls per key, like a Workers rate limiter within one period. */
function fakeRateLimit(limit: number): RateLimit {
  const counts = new Map<string, number>()
  return {
    limit: async ({ key: name }) => {
      const next = (counts.get(name) ?? 0) + 1
      counts.set(name, next)
      return { success: next <= limit }
    },
  }
}

const sessionCookie = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .find((value) => value?.startsWith('better-auth.session_token=')) ?? ''

describe('email and password', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    t.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: TEST_ORIGIN, ...headers },
      body: JSON.stringify(body),
    })
  const signUp = (email: string, password: string, name = '') =>
    post('/api/auth/sign-up/email', { email, password, name })
  const signIn = (email: string, password: string, headers: Record<string, string> = {}) =>
    post('/api/auth/sign-in/email', { email, password }, headers)
  const requestReset = (ip: string) =>
    post(
      '/api/auth/email-otp/request-password-reset',
      { email: 'flood@example.com' },
      { 'cf-connecting-ip': ip },
    )
  const me = (cookie: string) => t.request('/api/me', { headers: { cookie } })

  beforeAll(async () => {
    t = await createTestApp({
      EMAIL: {
        send: async (message) => {
          sent.push(message)
          return { messageId: 'test' }
        },
      },
      AUTH_EMAIL_RATE_LIMIT: fakeRateLimit(3),
      AUTH_IP_RATE_LIMIT: fakeRateLimit(5),
    })
  })
  afterAll(() => t.dispose())

  it('signs up, signs in and rejects wrong passwords', async () => {
    const password = key()
    const created = await signUp('mama@example.com', password)
    expect(created.status).toBe(200)
    const user: { name: string; email: string } = await (await me(sessionCookie(created))).json()
    expect(user).toMatchObject({ name: 'mama', email: 'mama@example.com' })

    expect((await signUp('mama@example.com', key())).status).toBe(422)
    expect((await signIn('mama@example.com', password)).status).toBe(200)
    expect((await signIn('mama@example.com', key())).status).toBe(401)
    expect((await signIn('nobody@example.com', password)).status).toBe(401)
  })

  it('keeps the nickname given at sign-up', async () => {
    const res = await signUp('papa@example.com', key(), '爸爸')
    expect(await (await me(sessionCookie(res))).json()).toMatchObject({ name: '爸爸' })
  })

  it('lists how the account signs in, renames it and changes its password', async () => {
    const password = key()
    // Its own address, apart from the rate limits other tests use up.
    const ip = { 'cf-connecting-ip': '192.0.2.7' }
    const created = await post(
      '/api/auth/sign-up/email',
      { email: 'methods@example.com', password, name: '' },
      ip,
    )
    const cookie = sessionCookie(created)
    const methods = await t.request('/api/account', { headers: { cookie } })
    expect(await methods.json()).toEqual({ google: false, password: true, passkeys: 0 })

    expect((await post('/api/auth/update-user', { name: '妈妈' }, { cookie, ...ip })).status).toBe(
      200,
    )
    const renamed: { name: string } = await (await me(cookie)).json()
    expect(renamed.name).toBe('妈妈')

    const elsewhere = sessionCookie(await signIn('methods@example.com', password, ip))
    const next = key()
    const changed = await post(
      '/api/auth/change-password',
      { currentPassword: password, newPassword: next, revokeOtherSessions: true },
      { cookie, ...ip },
    )
    expect(changed.status).toBe(200)
    expect((await signIn('methods@example.com', password, ip)).status).toBe(401)
    expect((await signIn('methods@example.com', next, ip)).status).toBe(200)
    // Other devices are signed out; this one keeps its (renewed) session.
    expect((await me(elsewhere)).status).toBe(401)
    expect((await me(sessionCookie(changed))).status).toBe(200)
  })

  it('refuses raw passwords that were not stretched by the app', async () => {
    expect((await signUp('raw@example.com', 'hunter22')).status).toBe(400)
  })

  it('resets a forgotten password with an emailed code and ends old sessions', async () => {
    const old = key()
    const session = sessionCookie(await signUp('reset@example.com', old))
    expect(
      (await post('/api/auth/email-otp/request-password-reset', { email: 'reset@example.com' }))
        .status,
    ).toBe(200)
    const message = sent.at(-1)
    expect(message?.subject).toMatch(/^Lullabo 重置密码验证码：\d{6}$/)

    const next = key()
    const reset = await post('/api/auth/email-otp/reset-password', {
      email: 'reset@example.com',
      otp: codeFor('reset@example.com'),
      password: next,
    })
    expect(reset.status).toBe(200)
    expect((await signIn('reset@example.com', old)).status).toBe(401)
    expect((await signIn('reset@example.com', next)).status).toBe(200)
    expect((await me(session)).status).toBe(401)
  })

  it('does not reveal or email unknown addresses, and has no code sign-in', async () => {
    const before = sent.length
    expect(
      (await post('/api/auth/email-otp/request-password-reset', { email: 'ghost@example.com' }))
        .status,
    ).toBe(200)
    await post('/api/auth/email-otp/send-verification-otp', {
      email: 'mama@example.com',
      type: 'sign-in',
    })
    expect(sent.length).toBe(before)
  })

  it('rate limits reset emails per address and password guesses per account', async () => {
    const resets = []
    for (const ip of ['198.51.100.1', '198.51.100.2', '198.51.100.3', '198.51.100.4']) {
      resets.push((await requestReset(ip)).status)
    }
    expect(resets).toEqual([200, 200, 200, 429])

    const guesses = []
    for (let i = 0; i < 6; i += 1) {
      // Different IPs: the per-account limit must still apply.
      guesses.push(
        (await signIn('papa@example.com', key(), { 'cf-connecting-ip': `203.0.113.${i}` })).status,
      )
    }
    expect(guesses).toEqual([401, 401, 401, 401, 401, 429])
  })
})

describe('password hashing', () => {
  it('salts each hash and verifies only the same derived key', async () => {
    const derived = key()
    const a = await hashPassword(derived)
    const b = await hashPassword(derived)
    expect(a).toMatch(/^v1\$[0-9a-f]{32}\$[0-9a-f]{64}$/)
    expect(a).not.toBe(b)
    expect(await verifyPassword({ hash: a, password: derived })).toBe(true)
    expect(await verifyPassword({ hash: a, password: key() })).toBe(false)
    expect(await verifyPassword({ hash: 'garbage', password: derived })).toBe(false)
    await expect(hashPassword('x'.repeat(64))).rejects.toThrow('Expected a derived password key')
  })
})

describe('sendEmail', () => {
  const email: OutgoingEmail = { to: 'a@example.com', subject: 's', text: 't', html: '<p>t</p>' }

  it('uses Resend when no Email Service binding exists', async () => {
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
      async () => new Response('{}', { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    try {
      await sendEmail(
        { RESEND_API_KEY: 're_test', EMAIL_FROM: 'Bobo <hi@bobo.test>' } as Env,
        email,
      )
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        expect.objectContaining({ method: 'POST' }),
      )
      const body = fetchMock.mock.calls[0]?.[1].body
      expect(JSON.parse(typeof body === 'string' ? body : '')).toMatchObject({
        from: 'Bobo <hi@bobo.test>',
        to: ['a@example.com'],
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('fails loudly when Resend refuses the message', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 422 }))
    try {
      await expect(sendEmail({ RESEND_API_KEY: 're_test' } as Env, email)).rejects.toThrow('422')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
