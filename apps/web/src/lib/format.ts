/**
 * Number formatting for the whole app, on Intl. Values arrive in the display currency already
 * converted; these only decide how they read, in the active locale unless one is given.
 */

import { getLocale } from './i18n'

/** Crypto display currencies Intl doesn't know, with their symbols and precision. */
const CRYPTO = {
  BTC: { symbol: '₿', digits: 6 },
  ETH: { symbol: 'Ξ', digits: 4 },
} as const

type CryptoCode = keyof typeof CRYPTO

const isCrypto = (code: string): code is CryptoCode => code in CRYPTO

export interface MoneyOptions {
  /** Shorten large values: 1.2M, 12.3K. */
  compact?: boolean
  /** Always show a sign, for changes. */
  signed?: boolean
}

/** Formats a value in a fiat currency (ISO 4217) or BTC/ETH. */
export function formatMoney(
  value: number,
  currency: string,
  options: MoneyOptions = {},
  locale: string = getLocale(),
): string {
  const { compact = false, signed = false } = options
  const signDisplay = signed ? 'exceptZero' : 'auto'
  if (isCrypto(currency)) {
    const { symbol, digits } = CRYPTO[currency]
    const number = new Intl.NumberFormat(locale, {
      notation: compact ? 'compact' : 'standard',
      maximumFractionDigits: compact ? 2 : digits,
      minimumFractionDigits: compact ? 0 : Math.min(2, digits),
      signDisplay,
    }).format(value)
    // Keep the sign before the symbol: -₿0.5, +Ξ1.2.
    const sign = /^[+-]/.exec(number)?.[0] ?? ''
    return `${sign}${symbol}${number.slice(sign.length)}`
  }
  const abs = Math.abs(value)
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    // "$" rather than "US$" in every locale, as crypto apps write it; other dollars keep
    // their prefix (HK$, S$...) so they stay distinguishable.
    currencyDisplay: currency === 'USD' ? 'narrowSymbol' : 'symbol',
    notation: compact && abs >= 10_000 ? 'compact' : 'standard',
    maximumSignificantDigits: compact && abs >= 10_000 ? 3 : undefined,
    // Sub-cent prices need more digits; everything else reads as money.
    maximumFractionDigits: abs > 0 && abs < 1 && !compact ? significantDigits(abs) : 2,
    minimumFractionDigits: compact && abs >= 10_000 ? 0 : 2,
    signDisplay,
  }).format(value)
}

/** Enough fraction digits to show 3 significant figures of a value below 1 (max 8). */
function significantDigits(abs: number): number {
  const leadingZeros = Math.max(0, -Math.floor(Math.log10(abs)) - 1)
  return Math.min(8, Math.max(2, leadingZeros + 3))
}

/** A ratio as a percentage: 0.1234 → "12.34%". */
export function formatPercent(
  ratio: number,
  options: { signed?: boolean } = {},
  locale: string = getLocale(),
): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: options.signed ? 'exceptZero' : 'auto',
  }).format(ratio)
}

/** A token amount (decimal string or number) with sensible precision. */
export function formatAmount(amount: string | number, locale: string = getLocale()): string {
  const value = typeof amount === 'number' ? amount : Number(amount)
  if (!Number.isFinite(value)) return String(amount)
  const abs = Math.abs(value)
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: abs === 0 ? 0 : abs < 1 ? significantDigits(abs) : abs < 1000 ? 4 : 2,
  }).format(value)
}
