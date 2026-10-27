import {
  type Event,
  type PushMessage,
  base64UrlDecode,
  base64UrlEncode,
  newId,
} from '@lullabo/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { MAX_SENDS, dispatchReminders } from '../src/reminders'
import { encryptPayload, generateVapidKeys, vapidAuthorization } from '../src/web-push'
import { createTestApp } from './app'
import { baby as fixtureBaby } from './fixtures'

const HOUR = 3_600_000

async function generatePair(): Promise<CryptoKeyPair> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])
  if (!('privateKey' in pair)) throw new Error('Expected a key pair')
  return pair
}

async function exportRaw(key: CryptoKey): Promise<Uint8Array<ArrayBuffer>> {
  const exported = await crypto.subtle.exportKey('raw', key)
  if (!(exported instanceof ArrayBuffer)) throw new Error('Expected raw key bytes')
  return new Uint8Array(exported)
}

const encode = (text: string) => new Uint8Array(new TextEncoder().encode(text))

/** A browser's side of a push subscription: its ECDH key pair and auth secret. */
async function fakeBrowser() {
  const pair = await generatePair()
  const publicRaw = await exportRaw(pair.publicKey)
  const auth = crypto.getRandomValues(new Uint8Array(16))
  return {
    pair,
    keys: { p256dh: base64UrlEncode(publicRaw), auth: base64UrlEncode(auth) },
    publicRaw,
    auth,
  }
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8),
  )
}

/** Decrypts an aes128gcm body the way a browser does (RFC 8291). */
async function decrypt(browser: Awaited<ReturnType<typeof fakeBrowser>>, body: Uint8Array) {
  const salt = body.slice(0, 16)
  const idLength = body[20] ?? 0
  const asPublic = body.slice(21, 21 + idLength)
  const ciphertext = body.slice(21 + idLength)
  const asKey = await crypto.subtle.importKey(
    'raw',
    asPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  const ecdh = { name: 'ECDH', public: asKey }
  const secret = new Uint8Array(await crypto.subtle.deriveBits(ecdh, browser.pair.privateKey, 256))
  const info = new Uint8Array([...encode('WebPush: info\0'), ...browser.publicRaw, ...asPublic])
  const ikm = await hkdf(browser.auth, secret, info, 32)
  const cek = await hkdf(salt, ikm, encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, encode('Content-Encoding: nonce\0'), 12)
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt'])
  const plain = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext),
  )
  expect(plain.at(-1)).toBe(2)
  return new TextDecoder().decode(plain.slice(0, -1))
}

describe('web push', () => {
  it('encrypts payloads a browser can decrypt', async () => {
    const browser = await fakeBrowser()
    const body = await encryptPayload(browser.keys, encode('{"hi":"宝宝"}'))
    expect(await decrypt(browser, body)).toBe('{"hi":"宝宝"}')
  })

  it('signs a VAPID token for the push service origin', async () => {
    const keys = await generateVapidKeys()
    const now = Date.UTC(2026, 9, 14)
    const header = await vapidAuthorization(
      'https://push.example.com/send/abc',
      keys,
      'https://bobo.example.com',
      now,
    )
    const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header)
    if (!match) throw new Error(`unexpected header: ${header}`)
    const [, head = '', claims = '', signature = '', k = ''] = match
    expect(k).toBe(keys.publicKey)
    expect(JSON.parse(new TextDecoder().decode(base64UrlDecode(claims)))).toEqual({
      aud: 'https://push.example.com',
      exp: now / 1000 + 12 * 3600,
      sub: 'https://bobo.example.com',
    })
    const publicKey = await crypto.subtle.importKey(
      'raw',
      base64UrlDecode(keys.publicKey),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    )
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      base64UrlDecode(signature),
      encode(`${head}.${claims}`),
    )
    expect(valid).toBe(true)
  })
})

/** Captures what would be sent to push services. */
function pushService(status = 201) {
  const sent: { url: string; body: Uint8Array; headers: Headers }[] = []
  const fetcher: typeof fetch = async (input, init) => {
    sent.push({
      url: input instanceof Request ? input.url : input.toString(),
      body: init?.body instanceof Uint8Array ? init.body : new Uint8Array(),
      headers: new Headers(init?.headers),
    })
    return new Response(null, { status })
  }
  return { sent, fetcher }
}

describe('reminders', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>
  let headers: Headers
  let userId: string
  let familyId: string
  const now = Date.now()

  const send = (method: string, path: string, body: unknown, h = headers) =>
    t.send(method, path, h, body)
  const baby = () => fixtureBaby(familyId, { name: '小米粒', createdAt: now, updatedAt: now })

  function feeding(babyId: string, startAt: number): Event {
    return {
      id: newId(),
      babyId,
      familyId,
      type: 'feeding',
      startAt,
      endAt: null,
      note: null,
      data: { kind: 'bottle', amountMl: 120, milk: 'formula' },
      createdAt: startAt,
      updatedAt: startAt,
      deletedAt: null,
      createdBy: null,
    }
  }

  beforeAll(async () => {
    t = await createTestApp()
    const me = await t.signIn()
    headers = me.headers
    userId = me.user.id
    const res = await send('POST', '/api/families', { name: '我们家' })
    const family: { id: string } = await res.json()
    familyId = family.id
  })
  afterAll(() => t.dispose())

  it('serves a stable VAPID public key', async () => {
    const first = (await (await t.request('/api/push/key', { headers })).json()) as {
      publicKey: string
    }
    const second = (await (await t.request('/api/push/key', { headers })).json()) as {
      publicKey: string
    }
    expect(base64UrlDecode(first.publicKey)).toHaveLength(65)
    expect(second).toEqual(first)
  })

  it('validates subscriptions and reminders and checks access', async () => {
    expect((await send('PUT', '/api/push/subscription', { endpoint: 'http://x' })).status).toBe(400)
    const reminder = { babyId: newId(), kind: 'feeding', intervalMinutes: 180, enabled: true }
    expect((await send('PUT', '/api/reminders', reminder)).status).toBe(403)
    expect((await send('PUT', '/api/reminders', { ...reminder, intervalMinutes: 5 })).status).toBe(
      400,
    )
    expect((await t.request('/api/reminders')).status).toBe(401)
    // Keys must have the sizes the Push API gives them.
    const { keys } = await fakeBrowser()
    for (const bad of [
      { ...keys, p256dh: 'x' },
      { ...keys, auth: keys.p256dh },
    ]) {
      const res = await send('PUT', '/api/push/subscription', {
        endpoint: 'https://push.example.com/bad',
        keys: bad,
      })
      expect(res.status).toBe(400)
    }
  })

  it('notifies once per gap after the interval since the last feeding', async () => {
    const b = baby()
    await send('POST', '/api/sync/push', { babies: [b], events: [feeding(b.id, now - HOUR)] })
    const browser = await fakeBrowser()
    const endpoint = `https://push.example.com/${newId()}`
    expect(
      (await send('PUT', '/api/push/subscription', { endpoint, keys: browser.keys })).status,
    ).toBe(204)
    const reminder = { babyId: b.id, kind: 'feeding', intervalMinutes: 180, enabled: true }
    expect((await send('PUT', '/api/reminders', reminder)).status).toBe(200)
    expect(await (await t.request('/api/reminders', { headers })).json()).toEqual([reminder])

    // Not due yet.
    const early = pushService()
    expect(await dispatchReminders(t.env, now + HOUR, early.fetcher)).toBe(0)
    expect(early.sent).toHaveLength(0)

    // Due two hours later: one notification, then nothing more for the same feeding.
    const due = pushService()
    expect(await dispatchReminders(t.env, now + 2 * HOUR + 60_000, due.fetcher)).toBe(1)
    expect(due.sent[0]?.url).toBe(endpoint)
    expect(due.sent[0]?.headers.get('Content-Encoding')).toBe('aes128gcm')
    const message: PushMessage = JSON.parse(
      await decrypt(browser, due.sent[0]?.body ?? new Uint8Array()),
    )
    expect(message).toEqual({
      title: '该喂奶啦',
      body: '小米粒 距上次喂养已经 3 小时 1 分钟',
      tag: `reminder-${b.id}-feeding`,
      url: '/',
    })
    expect(await dispatchReminders(t.env, now + 2 * HOUR + 120_000, pushService().fetcher)).toBe(0)

    // A new feeding starts a new gap.
    await send('POST', '/api/sync/push', { events: [feeding(b.id, now + 2 * HOUR + 180_000)] })
    expect(await dispatchReminders(t.env, now + 5 * HOUR + 240_000, pushService().fetcher)).toBe(1)
  })

  it('sends a reminder once when two runs find it due at the same time', async () => {
    const b = baby()
    // The user's devices are those subscribed in the tests above.
    await send('POST', '/api/sync/push', { babies: [b], events: [feeding(b.id, now - HOUR)] })
    await send('PUT', '/api/reminders', {
      babyId: b.id,
      kind: 'feeding',
      intervalMinutes: 120,
      enabled: true,
    })
    // Two Workers' crons, or an overlapping retry, in the same minute.
    const first = pushService()
    const second = pushService()
    await Promise.all([
      dispatchReminders(t.env, now + HOUR + 60_000, first.fetcher),
      dispatchReminders(t.env, now + HOUR + 60_000, second.fetcher),
    ])
    // One of them sends it, to every device; the other sends nothing.
    expect([first.sent.length > 0, second.sent.length > 0].filter(Boolean)).toHaveLength(1)
  })

  it("doesn't notify for a gap that was already overdue when the reminder was set", async () => {
    const b = baby()
    await send('POST', '/api/sync/push', { babies: [b], events: [feeding(b.id, now - 4 * HOUR)] })
    await send('PUT', '/api/push/subscription', {
      endpoint: `https://push.example.com/${newId()}`,
      keys: (await fakeBrowser()).keys,
    })
    await send('PUT', '/api/reminders', {
      babyId: b.id,
      kind: 'feeding',
      intervalMinutes: 120,
      enabled: true,
    })
    const service = pushService()
    await dispatchReminders(t.env, now, service.fetcher)
    expect(service.sent).toHaveLength(0)
  })

  it('removes subscriptions the push service reports as gone', async () => {
    const b = baby()
    await send('POST', '/api/sync/push', { babies: [b], events: [feeding(b.id, now)] })
    await send('PUT', '/api/reminders', {
      babyId: b.id,
      kind: 'feeding',
      intervalMinutes: 30,
      enabled: true,
    })
    const gone = pushService(410)
    expect(await dispatchReminders(t.env, now + HOUR / 2, gone.fetcher)).toBe(0)
    expect(gone.sent).toHaveLength(2)
    const { count } = (await t.env.DB.prepare(
      'select count(*) as count from push_subscriptions',
    ).first<{ count: number }>()) ?? { count: -1 }
    expect(count).toBe(0)
  })

  it('sends at most MAX_SENDS pushes a run and leaves the rest for the next', async () => {
    const devices = MAX_SENDS / 2 + 1
    const first = baby()
    const second = baby()
    await send('POST', '/api/sync/push', {
      babies: [first, second],
      events: [feeding(first.id, now), feeding(second.id, now)],
    })
    await t.env.DB.prepare('delete from push_subscriptions').run()
    for (let i = 0; i < devices; i += 1) {
      const browser = await fakeBrowser()
      await send('PUT', '/api/push/subscription', {
        endpoint: `https://push.example.com/${newId()}`,
        keys: browser.keys,
      })
    }
    for (const b of [first, second]) {
      await send('PUT', '/api/reminders', {
        babyId: b.id,
        kind: 'feeding',
        intervalMinutes: 30,
        enabled: true,
      })
    }
    const run = pushService()
    expect(await dispatchReminders(t.env, now + HOUR, run.fetcher)).toBe(devices)
    const next = pushService()
    expect(await dispatchReminders(t.env, now + HOUR + 60_000, next.fetcher)).toBe(devices)
    expect(await dispatchReminders(t.env, now + HOUR + 120_000, pushService().fetcher)).toBe(0)
  })

  it('sends the rest when one saved subscription has keys that cannot be used', async () => {
    const b = baby()
    await send('POST', '/api/sync/push', { babies: [b], events: [feeding(b.id, now)] })
    await t.env.DB.prepare('delete from push_subscriptions').run()
    // Saved before keys were checked.
    await t.env.DB.prepare(
      'insert into push_subscriptions (endpoint, user_id, p256dh, auth, created_at) values (?, ?, ?, ?, ?)',
    )
      .bind('https://push.example.com/broken', userId, 'x', 'y', now)
      .run()
    const browser = await fakeBrowser()
    await send('PUT', '/api/push/subscription', {
      endpoint: `https://push.example.com/${newId()}`,
      keys: browser.keys,
    })
    await send('PUT', '/api/reminders', {
      babyId: b.id,
      kind: 'feeding',
      intervalMinutes: 30,
      enabled: true,
    })
    const service = pushService()
    expect(await dispatchReminders(t.env, now + HOUR, service.fetcher)).toBe(1)
    // Marked as sent: the next run doesn't repeat it.
    expect(await dispatchReminders(t.env, now + HOUR + 60_000, pushService().fetcher)).toBe(0)
  })
})
