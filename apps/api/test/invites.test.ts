import {
  type Baby,
  type FamilyRole,
  type FamilySummary,
  type Invite,
  type InvitePreview,
  newId,
} from '@lullabo/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createTestApp } from './app'
import { baby } from './fixtures'

type User = { id: string; headers: Headers }

describe('invites', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>
  let owner: User
  let familyId: string
  let babyA: Baby

  const send = (method: string, path: string, who?: User, body?: unknown) =>
    t.send(method, path, who?.headers, body)
  const user = async (name: string): Promise<User> => {
    const signedIn = await t.signIn(name)
    return { id: signedIn.user.id, headers: signedIn.headers }
  }
  const invite = async (who: User, body: { role: string; babyIds: string[] | null }) => {
    const res = await send('POST', `/api/families/${familyId}/invites`, who, body)
    expect(res.status).toBe(201)
    return (await res.json()) as Invite
  }
  const accept = (code: string, who: User) => send('POST', `/api/invites/${code}/accept`, who)
  const families = async (who: User) =>
    (await (await t.request('/api/families', { headers: who.headers })).json()) as FamilySummary[]

  beforeAll(async () => {
    t = await createTestApp()
    owner = await user('妈妈')
    const res = await send('POST', '/api/families', owner, { name: '我们家' })
    const family: FamilySummary = await res.json()
    familyId = family.id
    babyA = baby(familyId, { name: '老大' })
    await send('POST', '/api/sync/push', owner, {
      babies: [babyA, baby(familyId, { name: '老二' })],
      events: [],
    })
  })
  afterAll(() => t.dispose())

  it('previews an invite without signing in and joins with its role and scope', async () => {
    const created = await invite(owner, { role: 'caregiver', babyIds: [babyA.id] })
    expect(created.code).toMatch(/^[\w-]{22}$/)

    const preview = await t.request(`/api/invites/${created.code}`)
    expect(await preview.json()).toEqual({
      familyName: '我们家',
      inviterName: '妈妈',
      role: 'caregiver',
      babyNames: ['老大'],
      status: 'active',
    } satisfies InvitePreview)

    const grandma = await user('外婆')
    const res = await accept(created.code, grandma)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ familyId })
    expect(await families(grandma)).toMatchObject([
      { id: familyId, name: '我们家', role: 'caregiver', babyIds: [babyA.id] },
    ])
  })

  it('works once', async () => {
    const created = await invite(owner, { role: 'viewer', babyIds: null })
    expect((await accept(created.code, await user('a'))).status).toBe(200)
    const late = await accept(created.code, await user('b'))
    expect(late.status).toBe(410)
    expect(await late.json()).toEqual({ error: 'used' })
    const preview: InvitePreview = await (await t.request(`/api/invites/${created.code}`)).json()
    expect(preview.status).toBe('used')
  })

  it('reports members who accept again without using the invite', async () => {
    const created = await invite(owner, { role: 'viewer', babyIds: null })
    const res = await accept(created.code, owner)
    expect(res.status).toBe(409)
    const preview: InvitePreview = await (await t.request(`/api/invites/${created.code}`)).json()
    expect(preview.status).toBe('active')
  })

  it('stops working when revoked or expired', async () => {
    const revoked = await invite(owner, { role: 'viewer', babyIds: null })
    const del = await send('DELETE', `/api/families/${familyId}/invites/${revoked.code}`, owner)
    expect(del.status).toBe(204)
    expect(await (await accept(revoked.code, await user('c'))).json()).toEqual({
      error: 'revoked',
    })

    const expired = await invite(owner, { role: 'viewer', babyIds: null })
    await t.env.DB.prepare('update invites set expires_at = ? where code = ?')
      .bind(Date.now() - 1, expired.code)
      .run()
    expect((await accept(expired.code, await user('d'))).status).toBe(410)
    expect((await accept('nope', await user('e'))).status).toBe(404)
  })

  it('lists only active invites to managers', async () => {
    const active = await invite(owner, { role: 'caregiver', babyIds: null })
    const res = await t.request(`/api/families/${familyId}/invites`, { headers: owner.headers })
    const list = (await res.json()) as Invite[]
    expect(list.map((item) => item.code)).toContain(active.code)
    expect(list.every((item) => item.expiresAt > Date.now())).toBe(true)
  })

  it('applies member management rules to who can invite whom', async () => {
    const join = async (role: FamilyRole) => {
      const member = await user(role)
      const created = await invite(owner, { role, babyIds: null })
      await accept(created.code, member)
      return member
    }
    const admin = await join('admin')
    const caregiver = await join('caregiver')
    const create = (who: User, role: string, babyIds: string[] | null = null) =>
      send('POST', `/api/families/${familyId}/invites`, who, { role, babyIds })

    expect((await create(admin, 'caregiver')).status).toBe(201)
    expect((await create(admin, 'admin')).status).toBe(403)
    expect((await create(caregiver, 'viewer')).status).toBe(403)
    expect((await create(owner, 'owner')).status).toBe(400)
    expect((await create(owner, 'viewer', [newId()])).status).toBe(400)
    expect(
      (await t.request(`/api/families/${familyId}/invites`, { headers: caregiver.headers })).status,
    ).toBe(403)
  })

  it("revokes a member's invites when they leave", async () => {
    const admin = await user('admin2')
    await accept((await invite(owner, { role: 'admin', babyIds: null })).code, admin)
    const pending = await invite(admin, { role: 'viewer', babyIds: null })
    await send('DELETE', `/api/families/${familyId}/members/${admin.id}`, admin)
    const preview: InvitePreview = await (await t.request(`/api/invites/${pending.code}`)).json()
    expect(preview.status).toBe('revoked')
  })

  it('requires a session to accept', async () => {
    const created = await invite(owner, { role: 'viewer', babyIds: null })
    expect((await send('POST', `/api/invites/${created.code}/accept`)).status).toBe(401)
  })
})
