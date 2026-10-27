import { passkey } from '@better-auth/passkey'
import { newId } from '@lullabo/shared'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { betterAuth } from 'better-auth/minimal'
import { bearer } from 'better-auth/plugins/bearer'
import { emailOTP } from 'better-auth/plugins/email-otp'
import { drizzle } from 'drizzle-orm/d1'

// Only Better Auth's own tables; the app's tables are queried with prepared statements.
import * as schema from './db/auth-schema'
import { passwordResetEmail, sendEmail } from './email'
import type { Env } from './env'
import { hashPassword, verifyPassword } from './password'

/**
 * The app origin, other origins serving the same app (e.g. workers.dev next to a custom
 * domain), and the future Capacitor shell (#45), which calls the API cross-origin.
 */
export function trustedOrigins(env: Env): string[] {
  const extra = (env.TRUSTED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean)
  return [env.BETTER_AUTH_URL, ...extra, 'capacitor://localhost', 'https://localhost']
}

/** Password reset codes stay valid for 10 minutes. */
export const OTP_TTL_SECONDS = 10 * 60

/**
 * Better Auth configured for the Workers free plan (10ms CPU per request):
 * - `better-auth/minimal` (no Kysely) and few plugins, to keep the bundle small
 * - signed cookie cache (compact HMAC, not JWE) so most requests validate the session
 *   without a D1 read, and a long `updateAge` so sessions are rarely rewritten
 * - email/password without scrypt: the app stretches passwords and the server stores a
 *   salted SHA-256 of the result (password.ts); resets use emailed one-time codes, stored
 *   hashed with SHA-256
 * - no DB-backed rate limiting: Workers rate limiters guard the auth endpoints (app.ts)
 */
export function createAuthOptions(env: Env) {
  const google =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
      : undefined

  return {
    baseURL: env.BETTER_AUTH_URL,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(drizzle(env.DB, { schema }), { provider: 'sqlite', schema }),
    socialProviders: google ? { google } : {},
    emailAndPassword: {
      enabled: true,
      // The app sends a 64-hex-character derived key, never the password itself.
      minPasswordLength: 64,
      maxPasswordLength: 64,
      password: { hash: hashPassword, verify: verifyPassword },
      revokeSessionsOnPasswordReset: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 60,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 5 * 60, strategy: 'compact' as const },
    },
    user: {
      additionalFields: { locale: { type: 'string' as const, required: false } },
    },
    rateLimit: { enabled: false },
    telemetry: { enabled: false },
    trustedOrigins: trustedOrigins(env),
    advanced: { database: { generateId: () => newId() } },
    databaseHooks: {
      user: {
        create: {
          // Email sign-up has no profile name; start with the address's local part.
          before: async (user: { name?: string | null; email: string }) => ({
            data: { ...user, name: user.name?.trim() || user.email.split('@')[0] || user.email },
          }),
        },
      },
    },
    plugins: [
      bearer(),
      // Passkeys belong to the canonical origin; other origins (workers.dev) can't use them.
      passkey({
        rpID: new URL(env.BETTER_AUTH_URL).hostname,
        rpName: 'Lullabo',
        origin: env.BETTER_AUTH_URL.replace(/\/+$/, ''),
        authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
      }),
      emailOTP({
        otpLength: 6,
        expiresIn: OTP_TTL_SECONDS,
        allowedAttempts: 5,
        storeOTP: 'hashed',
        // Codes are only used to reset a forgotten password; signing in needs the password.
        disableSignUp: true,
        sendVerificationOTP: async ({ email, otp, type }) => {
          if (type !== 'forget-password') return
          await sendEmail(env, passwordResetEmail(email, otp, OTP_TTL_SECONDS / 60))
        },
      }),
    ],
  }
}

export function createAuth(env: Env) {
  return betterAuth(createAuthOptions(env))
}

export type Auth = ReturnType<typeof createAuth>

// One instance per isolate: building the instance is pure CPU, and the env object is
// stable for the lifetime of the isolate.
const instances = new WeakMap<Env, Auth>()

export function getAuth(env: Env): Auth {
  let auth = instances.get(env)
  if (!auth) {
    auth = createAuth(env)
    instances.set(env, auth)
  }
  return auth
}
