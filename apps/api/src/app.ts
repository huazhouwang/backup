import { RECORDS_VERSION_HEADER } from '@bobo/shared'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { except } from 'hono/combine'
import { cors } from 'hono/cors'

import { getAuth, trustedOrigins } from './auth'
import { canSendEmail } from './email'
import { errorResponse, fail } from './http'
import { requireUser } from './middleware'
import { authRateLimit } from './rate-limit'
import { accountRoutes } from './routes/account'
import { familyAiRoutes, userAiRoutes } from './routes/ai'
import { familyRoutes } from './routes/families'
import { familyInviteRoutes, inviteAcceptRoutes, invitePreviewRoutes } from './routes/invites'
import { pushRoutes, reminderRoutes } from './routes/notifications'
import { syncRoutes } from './routes/sync'
import { tipsRoutes } from './routes/tips'
import { type AdapterFor, siriRoutes, voiceRoutes } from './routes/voice'
import type { AppEnv, AuthFor } from './types'
import { decryptKey, aiAdapter } from './voice/ai'

/** Request bodies above this are refused before they are read in full. */
const MAX_BODY_BYTES = 1024 * 1024

export interface AppOptions {
  auth?: AuthFor
  /** The model behind voice logging; tests pass a fake instead of calling a provider. */
  voiceAdapter?: AdapterFor
}

/** A saved provider, model and key, as a model adapter. */
const defaultAdapter: AdapterFor = async (env, ai) => {
  if (!env.ENCRYPTION_SECRET) return null
  return aiAdapter(ai.provider, ai.model, await decryptKey(env.ENCRYPTION_SECRET, ai.keyCipher))
}

export function createApp(options: AppOptions = {}) {
  const authFor = options.auth ?? getAuth
  const voiceAdapter = options.voiceAdapter ?? defaultAdapter
  const app = new Hono<AppEnv>().basePath('/api')

  // The web app is same-origin; CORS only matters for the native shell (#45).
  app.use(
    '*',
    cors({
      origin: (origin, c) => (trustedOrigins(c.env).includes(origin) ? origin : null),
      credentials: true,
      allowHeaders: ['Content-Type', 'Authorization', RECORDS_VERSION_HEADER],
      exposeHeaders: ['set-auth-token'],
    }),
  )

  // The largest legitimate body is a sync push of SYNC_PUSH_LIMIT records, well under this.
  app.use('*', bodyLimit({ maxSize: MAX_BODY_BYTES, onError: () => fail('too_large') }))

  app.get('/health', async (c) => {
    // Touch D1 so the check covers the binding, not just the Worker.
    await c.env.DB.prepare('select 1').first()
    return c.json({ ok: true })
  })

  // Only the options this deployment is set up for: Google needs its client, a password
  // reset needs a way to send the code.
  app.get('/sign-in-options', (c) =>
    c.json({
      google: Boolean(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET),
      passwordReset: canSendEmail(c.env),
    }),
  )

  app.use('/auth/*', authRateLimit)
  app.on(['GET', 'POST'], '/auth/*', (c) => authFor(c.env).handler(c.req.raw))

  // Every route needs a session except these: a new route is private unless listed here.
  app.use(
    '*',
    except(
      [
        '/api/health',
        '/api/auth/*',
        // Which sign-in options to show, before signing in.
        '/api/sign-in-options',
        // Who invited you, shown before signing in; accepting needs a session.
        '/api/invites/:code',
        // The shortcut authenticates with its own code.
        '/api/voice/siri',
      ],
      requireUser(authFor),
    ),
  )

  app.get('/me', (c) => {
    const user = c.get('user')
    return c.json({ id: user.id, name: user.name, email: user.email, image: user.image ?? null })
  })

  app.route('/ai', userAiRoutes)
  app.route('/account', accountRoutes)
  app.route('/families/:familyId/invites', familyInviteRoutes)
  app.route('/families/:familyId/ai', familyAiRoutes)
  app.route('/families', familyRoutes)
  app.route('/invites', invitePreviewRoutes)
  app.route('/invites', inviteAcceptRoutes)
  app.route('/sync', syncRoutes)
  app.route('/push', pushRoutes)
  app.route('/reminders', reminderRoutes)
  app.route('/tips', tipsRoutes(voiceAdapter))
  app.route('/voice/siri', siriRoutes(voiceAdapter))
  app.route('/voice', voiceRoutes(voiceAdapter))

  app.notFound(() => fail('not_found'))
  app.onError(errorResponse)

  return app
}
