import { Hono } from 'hono'

import { deleteAccountStatements } from '../db/cascade'
import type { AppEnv } from '../types'

const SESSION_COOKIES = ['better-auth.session_token', 'better-auth.session_data']

/**
 * Deletes the signed-in account and its data in one D1 transaction (App Store guideline
 * 5.1.1(v), Google Play). Families the user shares keep their data; if the user owned one,
 * the longest-standing other member becomes the owner.
 */
export const accountRoutes = new Hono<AppEnv>()
  // How the user can sign in: Google, a password, passkeys.
  .get('/', async (c) => {
    const userId = c.get('user').id
    const [accounts, passkeys] = await Promise.all([
      c.env.DB.prepare('select provider_id as provider from account where user_id = ?')
        .bind(userId)
        .all<{ provider: string }>(),
      c.env.DB.prepare('select count(*) as n from passkey where user_id = ?')
        .bind(userId)
        .first<{ n: number }>(),
    ])
    const providers = new Set(accounts.results.map((row) => row.provider))
    return c.json({
      google: providers.has('google'),
      password: providers.has('credential'),
      passkeys: passkeys?.n ?? 0,
    })
  })
  .delete('/', async (c) => {
    const db = c.env.DB
    const userId = c.get('user').id

    await db.batch(deleteAccountStatements(db, userId))

    // The signed cookie cache could otherwise keep the session looking valid for a few minutes.
    for (const name of SESSION_COOKIES) {
      c.header('Set-Cookie', `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`, {
        append: true,
      })
      c.header(
        'Set-Cookie',
        `__Secure-${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
        {
          append: true,
        },
      )
    }
    return c.body(null, 204)
  })
