/**
 * Auth: Better Auth with email OTP + Google; supports trying first (anonymous) and signing in later.
 * The free plan allows ~10 ms CPU per request: the slow password hash runs on the user's device (see password.ts); sessions are cached in a signed cookie so most requests skip the database.
 */
import { betterAuth } from 'better-auth';
import { env } from 'cloudflare:workers';
import { mailEnabled, sendOtpMail } from './mail';
import { DERIVED_LENGTH, hashPassword, verifyPassword } from './password';
import { schemaPlugins } from './auth-schema';
import { transferOwnership } from './repo';

function create() {
  const google =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, prompt: 'select_account' as const } }
      : undefined;
  return betterAuth({
    appName: 'Plinth',
    // Without APP_URL the base URL is inferred from the request (the default workers.dev URL works); set it once a custom domain is bound
    baseURL: env.APP_URL || undefined,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB,
    // The configured URL plus the address the request came in on (e.g. both a custom domain and workers.dev);
    // a request from the site's own origin is same-origin, not cross-site
    trustedOrigins: request => [env.APP_URL, request ? new URL(request.url).origin : undefined],
    // Email + password: the received "password" is a 64-char hex string derived on the device.
    // With a mail service, the email must be verified with an OTP after sign-up; without one, sign-up signs in directly.
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: mailEnabled(),
      minPasswordLength: DERIVED_LENGTH,
      maxPasswordLength: DERIVED_LENGTH,
      revokeSessionsOnPasswordReset: true,
      password: { hash: hashPassword, verify: verifyPassword },
    },
    emailVerification: { sendOnSignUp: mailEnabled(), sendOnSignIn: mailEnabled(), autoSignInAfterVerification: true },
    socialProviders: google,
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    user: { deleteUser: { enabled: true } },
    // Email OTP sign-in has no name: default to the email local part
    databaseHooks: {
      user: { create: { before: async u => ({ data: { ...u, name: u.name || (u.email?.split('@')[0] ?? '') } }) } },
    },
    // Rate limiting is handled by Cloudflare's rate-limit binding, not database counters
    rateLimit: { enabled: false },
    // The schema is managed by migrations; disable the schema check on every cold start (saves D1 reads and CPU)
    advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] }, database: { validateSchema: false } },
    plugins: schemaPlugins({ sendOtp: sendOtpMail, onLink: transferOwnership }),
  });
}

let instance: ReturnType<typeof create> | null = null;
/** Initialized once per isolate */
export const auth = () => (instance ??= create());
export const googleEnabled = () => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
