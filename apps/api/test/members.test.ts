import {
  type Baby,
  type Event,
  type FamilyMember,
  type FamilyRole,
  type FamilySummary,
  type PullResponse,
  type PushResponse,
  newId,
} from '@lullabo/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createTestApp } from './app'
import { T0, baby, diaper } from './fixtures'

type Member = { id: string; headers: Headers }

describe('roles, baby scope and member management', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>
  let owner: Member
  let familyId: string
  let babyA: Baby
  let babyB: Baby
  let ownerEvent: Event

  const send = (method: string, path: string, who: Member, body?: unknown) =>
    t.send(method, path, who.headers, body)
  const push = async (who: Member, body: { babies?: unknown[]; events?: unknown[] }) => {
    const res = await send('POST', '/api/sync/push', who, { babies: [], events: [], ...body })
    expect(res.status).toBe(200)
    return (await res.json()) as PushResponse
  }
  const pull = async (who: Member) => {
    const res = await t.request('/api/sync/pull', { headers: who.headers })
    expect(res.status).toBe(200)
    return (await res.json()) as PullResponse
  }
  const members = async (who: Member) => {
    const res = await t.request(`/api/families/${familyId}/members`, { headers: who.headers })
    expect(res.status).toBe(200)
    return (await res.json()) as FamilyMember[]
  }

  const at = (id: string) => `/api/families/${familyId}/members/${id}`

  /** Joins a new user to the family directly; invites are not part of this API yet. */
  async function join(role: FamilyRole, babyIds: string[] | null = null): Promise<Member> {
    const { user, headers } = await t.signIn(role)
    const db = t.env.DB
    await db.batch([
      db
        .prepare(
          'insert into memberships (family_id, user_id, role, baby_scope, created_at) values (?, ?, ?, ?, ?)',
        )
        .bind(familyId, user.id, role, babyIds ? 'selected' : 'all', Date.now()),
      ...(babyIds ?? []).map((babyId) =>
        db
          .prepare('insert into membership_babies (family_id, user_id, baby_id) values (?, ?, ?)')
          .bind(familyId, user.id, babyId),
      ),
    ])
    return { id: user.id, headers }
  }

  beforeAll(async () => {
    t = await createTestApp()
    const signedIn = await t.signIn('owner')
    owner = { id: signedIn.user.id, headers: signedIn.headers }
    const res = await send('POST', '/api/families', owner, { name: '我们家' })
    const family: FamilySummary = await res.json()
    familyId = family.id
    babyA = baby(familyId, { name: '老大' })
    babyB = baby(familyId, { name: '老二' })
    ownerEvent = diaper(babyA.id, familyId)
    await push(owner, { babies: [babyA, babyB], events: [ownerEvent] })
  })
  afterAll(() => t.dispose())

  describe('role enforcement on push', () => {
    it('lets a caregiver add events and change only their own', async () => {
      const caregiver = await join('caregiver')
      const own = diaper(babyA.id, familyId)
      expect((await push(caregiver, { events: [own] })).events).toEqual([
        { id: own.id, status: 'accepted' },
      ])
      const edited = { ...own, note: '改了', updatedAt: T0 + 1 }
      expect((await push(caregiver, { events: [edited] })).events[0]?.status).toBe('accepted')

      const others = { ...ownerEvent, deletedAt: T0 + 1, updatedAt: T0 + 1 }
      expect((await push(caregiver, { events: [others] })).events).toEqual([
        { id: ownerEvent.id, status: 'rejected', reason: 'forbidden' },
      ])
    })

    it('does not let a caregiver change babies', async () => {
      const caregiver = await join('caregiver')
      const result = await push(caregiver, {
        babies: [{ ...babyA, name: '改名', updatedAt: T0 + 1 }, baby(familyId)],
      })
      expect(result.babies.map((item) => item.status)).toEqual(['rejected', 'rejected'])
    })

    it('makes viewers read-only', async () => {
      const viewer = await join('viewer')
      const result = await push(viewer, { events: [diaper(babyA.id, familyId)] })
      expect(result.events[0]).toMatchObject({ status: 'rejected', reason: 'forbidden' })
      expect((await pull(viewer)).events.map((event) => event.id)).toContain(ownerEvent.id)
    })

    it('lets an admin manage babies', async () => {
      const admin = await join('admin')
      const added = baby(familyId, { name: '老三' })
      const result = await push(admin, { babies: [added] })
      expect(result.babies[0]?.status).toBe('accepted')
      // Clean up so later scope assertions only see the two original babies.
      await push(admin, { babies: [{ ...added, deletedAt: T0 + 1, updatedAt: T0 + 1 }] })
    })
  })

  describe('baby scope', () => {
    it('pulls only the scoped baby and its events, and reports access', async () => {
      const eventB = diaper(babyB.id, familyId)
      await push(owner, { events: [eventB] })
      const scoped = await join('caregiver', [babyA.id])

      const page = await pull(scoped)
      expect(page.babies.map((b) => b.id)).toEqual([babyA.id])
      expect(page.events.every((event) => event.babyId === babyA.id)).toBe(true)
      expect(page.events.map((event) => event.id)).not.toContain(eventB.id)
      expect(page.access).toMatchObject([
        { id: familyId, name: '我们家', role: 'caregiver', babyIds: [babyA.id] },
      ])
    })

    it('rejects writes for babies outside the scope, including moving events out', async () => {
      const scoped = await join('caregiver', [babyA.id])
      const own = diaper(babyA.id, familyId)
      await push(scoped, { events: [own] })
      const result = await push(scoped, {
        events: [diaper(babyB.id, familyId), { ...own, babyId: babyB.id, updatedAt: T0 + 1 }],
      })
      expect(result.events.map((item) => item.status)).toEqual(['rejected', 'rejected'])
    })

    it('returns no family data to users without a membership', async () => {
      const { user, headers } = await t.signIn('stranger')
      const stranger = { id: user.id, headers }
      const page = await pull(stranger)
      expect(page).toMatchObject({ babies: [], events: [], access: [] })
      const result = await push(stranger, { events: [diaper(babyA.id, familyId)] })
      expect(result.events[0]?.status).toBe('rejected')
    })
  })

  describe('member management', () => {
    it('lists members to every member and hides them from others', async () => {
      const viewer = await join('viewer', [babyB.id])
      const list = await members(viewer)
      expect(list[0]).toMatchObject({ userId: owner.id, role: 'owner', babyIds: null })
      expect(list.find((member) => member.userId === viewer.id)).toMatchObject({
        role: 'viewer',
        babyIds: [babyB.id],
      })

      const { user, headers } = await t.signIn('stranger')
      const res = await t.request(`/api/families/${familyId}/members`, { headers })
      expect(res.status).toBe(403)
      expect(user.id).toBeTruthy()
    })

    it('lets the owner change roles and baby scope', async () => {
      const member = await join('viewer')
      const path = `/api/families/${familyId}/members/${member.id}`
      expect((await send('PATCH', path, owner, { role: 'caregiver' })).status).toBe(204)
      expect((await send('PATCH', path, owner, { babyIds: [babyB.id] })).status).toBe(204)
      expect((await pull(member)).access).toMatchObject([
        { id: familyId, name: '我们家', role: 'caregiver', babyIds: [babyB.id] },
      ])
      expect((await send('PATCH', path, owner, { babyIds: null })).status).toBe(204)
      expect((await pull(member)).access[0]?.babyIds).toBeNull()
    })

    it('rejects babies from another family and empty updates', async () => {
      const member = await join('viewer')
      const path = `/api/families/${familyId}/members/${member.id}`
      expect((await send('PATCH', path, owner, { babyIds: [newId()] })).status).toBe(400)
      expect((await send('PATCH', path, owner, {})).status).toBe(400)
      expect((await send('PATCH', path, owner, { role: 'owner' })).status).toBe(400)
    })

    it('limits admins to caregivers and viewers', async () => {
      const admin = await join('admin')
      const otherAdmin = await join('admin')
      const viewer = await join('viewer')
      expect((await send('PATCH', at(viewer.id), admin, { role: 'caregiver' })).status).toBe(204)
      expect((await send('PATCH', at(viewer.id), admin, { role: 'admin' })).status).toBe(403)
      expect((await send('PATCH', at(otherAdmin.id), admin, { role: 'viewer' })).status).toBe(403)
      expect((await send('PATCH', at(owner.id), admin, { role: 'viewer' })).status).toBe(403)
      expect((await send('DELETE', at(otherAdmin.id), admin)).status).toBe(403)
      expect((await send('DELETE', at(viewer.id), admin)).status).toBe(204)
    })

    it('does not let caregivers or viewers manage anyone', async () => {
      const caregiver = await join('caregiver')
      const viewer = await join('viewer')
      expect((await send('PATCH', at(viewer.id), caregiver, { role: 'caregiver' })).status).toBe(
        403,
      )
      expect((await send('DELETE', at(viewer.id), caregiver)).status).toBe(403)
      expect(
        (await send('PATCH', `/api/families/${familyId}`, caregiver, { name: 'x' })).status,
      ).toBe(403)
    })

    it('lets members leave, but not the owner', async () => {
      const viewer = await join('viewer')
      expect((await send('DELETE', at(viewer.id), viewer)).status).toBe(204)
      expect((await pull(viewer)).access).toEqual([])
      expect((await send('DELETE', at(owner.id), owner)).status).toBe(403)
    })

    it('renames the family', async () => {
      const admin = await join('admin')
      expect(
        (await send('PATCH', `/api/families/${familyId}`, admin, { name: '新家' })).status,
      ).toBe(204)
      expect((await pull(owner)).access[0]?.name).toBe('新家')
      await send('PATCH', `/api/families/${familyId}`, owner, { name: '我们家' })
    })
  })

  describe('aliases', () => {
    it('keeps an alias private to the member who set it', async () => {
      const caregiver = await join('caregiver')
      const alias = (body: unknown) =>
        send('PUT', `/api/families/${familyId}/alias`, caregiver, body)
      expect((await alias({ alias: '  女儿家 ' })).status).toBe(204)
      expect((await pull(caregiver)).access[0]).toMatchObject({ name: '我们家', alias: '女儿家' })
      expect((await pull(owner)).access[0]).toMatchObject({ alias: null })
      expect((await alias({ alias: '' })).status).toBe(204)
      expect((await pull(caregiver)).access[0]?.alias).toBeNull()
      expect((await alias({ alias: 'x'.repeat(41) })).status).toBe(400)
      await send('DELETE', at(caregiver.id), caregiver)
    })

    it('reports how many members a family has', async () => {
      const { access } = await pull(owner)
      expect(access[0]?.memberCount).toBe((await members(owner)).length)
    })
  })

  describe('ownership transfer', () => {
    it('makes the target the owner with every baby and the previous owner an admin', async () => {
      const t2 = await createTestApp()
      try {
        const a = await t2.signIn('a')
        const b = await t2.signIn('b')
        const res = await t2.request('/api/families', {
          method: 'POST',
          headers: { ...Object.fromEntries(a.headers), 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: '家' }),
        })
        const family = (await res.json()) as FamilySummary
        await t2.env.DB.prepare(
          "insert into memberships (family_id, user_id, role, baby_scope, created_at) values (?, ?, 'viewer', 'selected', ?)",
        )
          .bind(family.id, b.user.id, Date.now())
          .run()

        const transfer = (from: Headers, userId: string) =>
          t2.request(`/api/families/${family.id}/transfer`, {
            method: 'POST',
            headers: { ...Object.fromEntries(from), 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId }),
          })
        expect((await transfer(b.headers, a.user.id)).status).toBe(403)
        expect((await transfer(a.headers, a.user.id)).status).toBe(403)
        expect((await transfer(a.headers, b.user.id)).status).toBe(204)

        const roles = async (headers: Headers) =>
          ((await (await t2.request('/api/families', { headers })).json()) as FamilySummary[])[0]
        expect(await roles(b.headers)).toMatchObject({ role: 'owner', babyIds: null })
        expect(await roles(a.headers)).toMatchObject({ role: 'admin', babyIds: null })
      } finally {
        await t2.dispose()
      }
    })
  })

  describe('deleting a family', () => {
    it('lets only the owner delete it, removing its data for everyone', async () => {
      const t2 = await createTestApp()
      try {
        const a = await t2.signIn('a')
        const b = await t2.signIn('b')
        const res = await t2.send('POST', '/api/families', a.headers, { name: '家' })
        const family = (await res.json()) as FamilySummary
        const kid = baby(family.id)
        await t2.send('POST', '/api/sync/push', a.headers, {
          babies: [kid],
          events: [diaper(kid.id, family.id)],
        })
        await t2.env.DB.prepare(
          "insert into memberships (family_id, user_id, role, created_at) values (?, ?, 'admin', ?)",
        )
          .bind(family.id, b.user.id, Date.now())
          .run()

        const remove = (headers: Headers) =>
          t2.send('DELETE', `/api/families/${family.id}`, headers)
        expect((await remove(b.headers)).status).toBe(403)
        expect((await remove(a.headers)).status).toBe(204)

        for (const who of [a, b]) {
          const pulled = (await (
            await t2.request('/api/sync/pull', { headers: who.headers })
          ).json()) as PullResponse
          expect(pulled).toMatchObject({ access: [], babies: [], events: [] })
        }
        const left = await t2.env.DB.prepare(
          `select (select count(*) from babies) + (select count(*) from events)
             + (select count(*) from memberships) + (select count(*) from families) as n`,
        ).first<{ n: number }>()
        expect(left?.n).toBe(0)
      } finally {
        await t2.dispose()
      }
    })
  })
})
