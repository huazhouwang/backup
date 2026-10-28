import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createTestApp } from './app'
import { baby } from './fixtures'

describe('account deletion', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>

  beforeAll(async () => {
    t = await createTestApp()
  })
  afterAll(() => t.dispose())

  const post = (path: string, body: unknown, headers: Headers) =>
    t.send('POST', path, headers, body)

  async function familyWithBaby(headers: Headers) {
    const res = await post('/api/families', { name: '我们家' }, headers)
    const { id }: { id: string } = await res.json()
    const b = baby(id)
    await post('/api/sync/push', { babies: [b] }, headers)
    return { familyId: id, babyId: b.id }
  }

  const count = async (sql: string, ...params: string[]) =>
    (
      await t.env.DB.prepare(sql)
        .bind(...params)
        .first<{ n: number }>()
    )?.n ?? -1

  it('requires a session', async () => {
    expect((await t.request('/api/account', { method: 'DELETE' })).status).toBe(401)
  })

  it('deletes the user, their sessions and families only they belong to', async () => {
    const { user, headers } = await t.signIn()
    const { familyId, babyId } = await familyWithBaby(headers)
    await t.env.DB.prepare(
      `insert into user_ai_keys (user_id, provider, key_cipher, key_hint, updated_at)
       values (?, 'openai', 'cipher', 'sk-…0000', 0)`,
    )
      .bind(user.id)
      .run()

    const res = await t.request('/api/account', { method: 'DELETE', headers })
    expect(res.status).toBe(204)
    const cleared = res.headers.getSetCookie().filter((cookie) => cookie.includes('Max-Age=0'))
    expect(cleared.some((cookie) => cookie.startsWith('better-auth.session_token='))).toBe(true)
    expect(cleared.some((cookie) => cookie.startsWith('better-auth.session_data='))).toBe(true)

    expect(await count('select count(*) as n from user where id = ?', user.id)).toBe(0)
    expect(await count('select count(*) as n from user_ai_keys where user_id = ?', user.id)).toBe(0)
    expect(await count('select count(*) as n from session where user_id = ?', user.id)).toBe(0)
    expect(await count('select count(*) as n from families where id = ?', familyId)).toBe(0)
    expect(await count('select count(*) as n from babies where id = ?', babyId)).toBe(0)
    // The old session no longer works once the short-lived cookie cache expires; without
    // the cache cookie it is rejected immediately.
    const tokenOnly = new Headers({ cookie: headers.get('cookie')?.split('; ')[0] ?? '' })
    expect((await t.request('/api/me', { headers: tokenOnly })).status).toBe(401)
  })

  it('keeps shared families and hands ownership to the next member', async () => {
    const owner = await t.signIn('主人')
    const other = await t.signIn('家人')
    const { familyId, babyId } = await familyWithBaby(owner.headers)
    // The next member only sees one baby; as the new owner they must see all of them.
    await t.env.DB.batch([
      t.env.DB.prepare(
        "insert into memberships (family_id, user_id, role, baby_scope, created_at) values (?, ?, 'caregiver', 'selected', ?)",
      ).bind(familyId, other.user.id, Date.now()),
      t.env.DB.prepare(
        'insert into membership_babies (family_id, user_id, baby_id) values (?, ?, ?)',
      ).bind(familyId, other.user.id, babyId),
    ])

    await t.request('/api/account', { method: 'DELETE', headers: owner.headers })

    expect(await count('select count(*) as n from babies where id = ?', babyId)).toBe(1)
    const membership = await t.env.DB.prepare(
      'select role, baby_scope as babyScope from memberships where family_id = ? and user_id = ?',
    )
      .bind(familyId, other.user.id)
      .first<{ role: string; babyScope: string }>()
    expect(membership).toEqual({ role: 'owner', babyScope: 'all' })
    expect(
      await count('select count(*) as n from membership_babies where family_id = ?', familyId),
    ).toBe(0)
    expect(
      await count('select count(*) as n from memberships where user_id = ?', owner.user.id),
    ).toBe(0)
  })

  it("deletes the observations of the families it deletes, and keeps shared families'", async () => {
    const owner = await t.signIn('主人')
    const other = await t.signIn('家人')
    const sole = await familyWithBaby(owner.headers)
    const shared = await familyWithBaby(owner.headers)
    await t.env.DB.batch([
      t.env.DB.prepare(
        "insert into memberships (family_id, user_id, role, baby_scope, created_at) values (?, ?, 'caregiver', 'all', ?)",
      ).bind(shared.familyId, other.user.id, Date.now()),
      ...[sole.babyId, shared.babyId].map((babyId) =>
        t.env.DB.prepare(
          "insert into observations (baby_id, day, text, created_at) values (?, '2026-10-17', '很规律。', ?)",
        ).bind(babyId, Date.now()),
      ),
    ])

    await t.request('/api/account', { method: 'DELETE', headers: owner.headers })

    const observations = 'select count(*) as n from observations where baby_id = ?'
    expect(await count(observations, sole.babyId)).toBe(0)
    expect(await count(observations, shared.babyId)).toBe(1)
  })
})
