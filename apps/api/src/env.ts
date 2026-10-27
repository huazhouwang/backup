import type { EmailBinding } from './email'

/** Bindings declared in wrangler.jsonc, typed by `wrangler types` (pnpm codegen). */
type Declared = Cloudflare.Env

/** Bindings, vars and secrets. Secrets and vars are set at deploy time, so they are listed here. */
export interface Env
  extends
    Pick<Declared, 'DB'>,
    Partial<
      Pick<
        Declared,
        | 'AUTH_EMAIL_RATE_LIMIT'
        | 'AUTH_IP_RATE_LIMIT'
        | 'VOICE_RATE_LIMIT'
        | 'SPEECH_RATE_LIMIT'
        | 'AI'
      >
    > {
  /** Public origin of the app, e.g. https://bobo.example.workers.dev */
  BETTER_AUTH_URL: string
  /** Secret used to sign session cookies (wrangler secret put BETTER_AUTH_SECRET). */
  BETTER_AUTH_SECRET: string
  /** Comma-separated extra origins serving the app, e.g. the workers.dev URL. */
  TRUSTED_ORIGINS?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  /** Cloudflare Email Service binding (Workers Paid plan); preferred when present. */
  EMAIL?: EmailBinding
  /** Resend API key, used to send email on the free plan (wrangler secret put RESEND_API_KEY). */
  RESEND_API_KEY?: string
  /** Sender address, e.g. "Lullabo <noreply@yourdomain.com>"; its domain must be verified. */
  EMAIL_FROM?: string
  /**
   * Encrypts secrets stored in the database, such as users' AI provider keys. Changing it
   * makes them unreadable; users then enter them again.
   */
  ENCRYPTION_SECRET?: string
}
