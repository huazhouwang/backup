import {
  type PullResponse,
  type PushResponse,
  RECORDS_VERSION,
  RECORDS_VERSION_HEADER,
} from '@lullabo/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createTestApp } from './app'
import { T0, baby, diaper } from './fixtures'

describe('families and sync', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>
  let headers: Headers
  let userId: string
  let familyId: string

  const json = (body: unknown, h: Headers = headers): RequestInit => ({
    method: 'POST',
    headers: { ...Object.fromEntries(h), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const push = async (body: { babies?: unknown[]; events?: unknown[] }, h = headers) => {
    const res = await t.request('/api/sync/push', json(body, h))
    if (res.status !== 200) throw new Error(`push failed: ${res.status}`)
    return (await res.json()) as PushResponse
  }
  const pull = async (cursor = '', h = headers) => {
    const res = await t.request(`/api/sync/pull?cursor=${cursor}`, { headers: h })
    if (res.status !== 200) throw new Error(`pull failed: ${res.status}`)
    return (await res.json()) as PullResponse
  }

  beforeAll(async () => {
    t = await createTestApp()
    const signedIn = await t.signIn()
    headers = signedIn.headers
    userId = signedIn.user.id
    const res = await t.request('/api/families', json({ name: '我们家' }))
    if (res.status !== 201) throw new Error(`create family failed: ${res.status}`)
    const created: { id: string } = await res.json()
    familyId = created.id
  })
  afterAll(() => t.dispose())

  it('lists the families the user belongs to', async () => {
    const res = await t.request('/api/families', { headers })
    expect(await res.json()).toMatchObject([
      { id: familyId, name: '我们家', role: 'owner', babyIds: null },
    ])
  })

  it('requires a session', async () => {
    expect((await t.request('/api/sync/pull')).status).toBe(401)
    expect((await t.request('/api/families')).status).toBe(401)
  })

  it('pushes and pulls records, then has nothing new', async () => {
    const b = baby(familyId)
    const e = diaper(b.id, familyId)
    const result = await push({ babies: [b], events: [e] })
    expect(result.babies).toEqual([{ id: b.id, status: 'accepted' }])
    expect(result.events).toEqual([{ id: e.id, status: 'accepted' }])

    const page = await pull()
    expect(page.babies).toContainEqual({ ...b, createdBy: userId })
    expect(page.events).toContainEqual({ ...e, createdBy: userId })

    const next = await pull(page.cursor)
    expect(next.babies).toEqual([])
    expect(next.events).toEqual([])
  })

  it('resolves conflicts by last write wins and re-sends newer versions', async () => {
    const b = baby(familyId)
    await push({ babies: [b] })
    const { cursor } = await pull()

    const newer = { ...b, name: '新名字', updatedAt: T0 + 10 }
    expect((await push({ babies: [newer] })).babies[0]?.status).toBe('accepted')
    const older = { ...b, name: '旧名字', updatedAt: T0 + 5 }
    expect((await push({ babies: [older] })).babies[0]?.status).toBe('stale')

    const changes = await pull(cursor)
    expect(changes.babies.map((x) => [x.id, x.name])).toEqual([[b.id, '新名字']])
  })

  it("removes a deleted baby's records and keeps its tombstone", async () => {
    const b = baby(familyId)
    const e = diaper(b.id, familyId)
    await push({ babies: [b], events: [e] })
    const { cursor } = await pull()
    const gone = { ...b, deletedAt: T0 + 20, updatedAt: T0 + 20 }
    expect((await push({ babies: [gone] })).babies[0]?.status).toBe('accepted')
    const changes = await pull(cursor)
    expect(changes.babies).toMatchObject([{ id: b.id, deletedAt: T0 + 20 }])
    const left = await t.env.DB.prepare('select count(*) as n from events where baby_id = ?')
      .bind(b.id)
      .first<{ n: number }>()
    expect(left?.n).toBe(0)
  })

  it('assigns createdBy on the server and keeps it', async () => {
    const b = baby(familyId, { createdBy: 'someone-else' })
    await push({ babies: [b] })
    await push({ babies: [{ ...b, createdBy: 'another', updatedAt: T0 + 1 }] })
    const row = await t.env.DB.prepare('select created_by as c from babies where id = ?')
      .bind(b.id)
      .first<{ c: string }>()
    expect(row?.c).toBe(userId)
  })

  it('gives bottles from apps that predate timers an end, and lets newer apps run them', async () => {
    const b = baby(familyId)
    const bottle = () => ({
      ...diaper(b.id, familyId),
      type: 'feeding',
      data: { kind: 'bottle', amountMl: 90, milk: 'formula' },
    })
    const legacy = bottle()
    const running = bottle()
    await push({ babies: [b], events: [legacy] })
    const current = new Headers(headers)
    current.set(RECORDS_VERSION_HEADER, RECORDS_VERSION)
    await push({ events: [running] }, current)

    const { events } = await pull()
    expect(events.find((e) => e.id === legacy.id)?.endAt).toBe(legacy.startAt)
    expect(events.find((e) => e.id === running.id)?.endAt).toBeNull()
  })

  it('rejects invalid items without blocking valid ones', async () => {
    const good = baby(familyId)
    const result = await push({ babies: [{ id: 'x', name: '' }, good] })
    expect(result.babies).toEqual([
      { id: 'x', status: 'rejected', reason: 'invalid' },
      { id: good.id, status: 'accepted' },
    ])
  })

  it('keeps other users out of the family', async () => {
    const other = await t.signIn('别人')
    const intruder = baby(familyId)
    const result = await push({ babies: [intruder] }, other.headers)
    expect(result.babies).toEqual([{ id: intruder.id, status: 'rejected', reason: 'forbidden' }])
    const page = await pull('', other.headers)
    expect(page.babies).toEqual([])
    expect(page.events).toEqual([])
  })

  it('does not let a record move to another family', async () => {
    const res = await t.request('/api/families', json({ name: '第二个家' }))
    const { id: second }: { id: string } = await res.json()
    const b = baby(familyId)
    await push({ babies: [b] })
    const moved = await push({ babies: [{ ...b, familyId: second, updatedAt: T0 + 1 }] })
    expect(moved.babies[0]).toEqual({ id: b.id, status: 'rejected', reason: 'family_mismatch' })
  })

  it('pages through large histories with few D1 queries', async () => {
    const b = baby(familyId)
    const events = Array.from({ length: 520 }, () => diaper(b.id, familyId))
    let before = t.queries.count
    await push({ babies: [b], events: events.slice(0, 300) })
    // memberships + 2 existing-row lookups + seq bump + 2 upserts; the session is cached.
    expect(t.queries.count - before).toBeLessThanOrEqual(6)
    await push({ events: events.slice(300) })

    const seen = new Set<string>()
    let cursor = ''
    let pages = 0
    for (;;) {
      before = t.queries.count
      const page = await pull(cursor)
      // memberships + one page query per table.
      expect(t.queries.count - before).toBeLessThanOrEqual(3)
      for (const event of page.events) seen.add(event.id)
      cursor = page.cursor
      pages += 1
      if (!page.hasMore) break
    }
    expect(pages).toBeGreaterThan(1)
    for (const event of events) expect(seen.has(event.id)).toBe(true)
  })

  it('rejects oversized pushes', async () => {
    const res = await t.request(
      '/api/sync/push',
      json({ events: Array.from({ length: 501 }, () => ({})) }),
    )
    expect(res.status).toBe(413)
  })

  it('refuses bodies over the size limit before reading them', async () => {
    const res = await t.request(
      '/api/sync/push',
      json({ events: [{ note: 'x'.repeat(2 * 1024 * 1024) }] }),
    )
    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({ error: 'too_large' })
  })
})
