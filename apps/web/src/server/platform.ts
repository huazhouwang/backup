/**
 * The platform's own model and free credits (issue 185): a new visitor designs without bringing an API key. The owner of the
 * deployment pays for it, so every call costs credits from an allowance (once for a guest, monthly once signed in), and a daily
 * cap over everyone bounds the bill. A user's own model, when they have one, is used instead and costs no credits.
 */
import { env } from 'cloudflare:workers';
import type { ModelWithKey } from './repo';
import { creditState as stateOf, type CreditSettings } from '@/shared/credits';

export { creditsFor, dayStart, periodStart, type CreditState } from '@/shared/credits';

/** The id the chat sends for the platform's model */
export const PLATFORM_MODEL_ID = 'platform';

interface PlatformEnv {
  PLATFORM_MODEL_PROVIDER?: string;
  PLATFORM_MODEL?: string;
  PLATFORM_MODEL_KEY?: string;
  PLATFORM_MODEL_BASE_URL?: string;
  PLATFORM_CREDITS_GUEST?: string;
  PLATFORM_CREDITS_USER?: string;
  PLATFORM_PRICE_INPUT?: string;
  PLATFORM_PRICE_OUTPUT?: string;
  PLATFORM_DAILY_CAP?: string;
}
const e = () => env as unknown as PlatformEnv;
const num = (v: string | undefined, fallback: number) => (v && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : fallback);

/** The platform model's configuration in the shape the chat adapters take, or null when the deployment has none */
export function platformModel(): { config: ModelWithKey; apiKey: string } | null {
  const { PLATFORM_MODEL_PROVIDER: provider, PLATFORM_MODEL: model, PLATFORM_MODEL_KEY: apiKey, PLATFORM_MODEL_BASE_URL: baseUrl } = e();
  if (!provider || !model || !apiKey) return null;
  return {
    apiKey,
    config: {
      id: PLATFORM_MODEL_ID,
      key_id: PLATFORM_MODEL_ID,
      label: 'OpenSU',
      model,
      provider,
      created_at: 0,
      user_id: '',
      base_url: baseUrl ?? null,
      key_ciphertext: '',
      key_iv: '',
    } as ModelWithKey,
  };
}

/**
 * Credit settings. One credit is the unit prices are set in (by default a US cent): PLATFORM_PRICE_INPUT and _OUTPUT are credits
 * per million tokens (defaults fit a mid-range model, $3 / $15), the allowances are credits.
 */
export function creditSettings(): CreditSettings {
  const x = e();
  return {
    guest: num(x.PLATFORM_CREDITS_GUEST, 100),
    user: num(x.PLATFORM_CREDITS_USER, 500),
    priceInput: num(x.PLATFORM_PRICE_INPUT, 300),
    priceOutput: num(x.PLATFORM_PRICE_OUTPUT, 1500),
    dailyCap: num(x.PLATFORM_DAILY_CAP, 20000),
  };
}

/** A user's credits, from what they spent this period */
export const creditState = (guest: boolean, spent: number, at = Date.now()) => stateOf(guest, spent, creditSettings(), !!platformModel(), at);
