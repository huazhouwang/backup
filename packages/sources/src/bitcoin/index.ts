import { z } from 'zod'

import { coingeckoId } from '../asset'
import { defineSource, field } from '../define'
import { SourceError } from '../errors'
import { fetchJson } from '../fetch'
import { nonZero, type Position } from '../position'
import { fromBaseUnits } from '../units'
import { parseTarget, type Target } from './target'

/** Trezor's public Blockbook: keyless, and it scans an xpub's addresses (gap limit) itself. */
const BLOCKBOOK = 'https://btc1.trezor.io/api/v2'
const SATOSHI_DECIMALS = 8

/**
 * A bare xpub doesn't say which addresses it was used for (Ledger Live, for one, shows every
 * account as an xpub), so all four standard script types are scanned and summed. They derive
 * different addresses, so nothing is counted twice. ypub and zpub name their script type and
 * Blockbook reads them as they are.
 */
const XPUB_DESCRIPTORS = [
  (key: string) => `pkh(${key})`,
  (key: string) => `sh(wpkh(${key}))`,
  (key: string) => `wpkh(${key})`,
  (key: string) => `tr(${key})`,
]

/**
 * Blockbook's `details=basic` answer for an address or an xpub. `balance` is the confirmed
 * balance in satoshis; this level leaves out the unconfirmed balance, so an incoming payment
 * shows once it has one confirmation.
 */
const balanceSchema = z.object({ balance: z.string().regex(/^\d+$/) })

function target(value: string): Target {
  const parsed = parseTarget(value)
  if ('error' in parsed) throw new SourceError('invalid_config', parsed.error)
  return parsed
}

/** Blockbook paths for a target; descriptors keep their brackets percent-encoded. */
function paths(of: Target): string[] {
  if (of.type === 'address') return [`/address/${of.address}`]
  const keys = of.prefix === 'xpub' ? XPUB_DESCRIPTORS.map((wrap) => wrap(of.key)) : [of.key]
  return keys.map(
    (key) => `/xpub/${encodeURIComponent(key).replaceAll('(', '%28').replaceAll(')', '%29')}`,
  )
}

/** The first and last characters only: an xpub reveals a whole wallet's history. */
const shorten = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`

export const bitcoin = defineSource({
  id: 'bitcoin',
  kind: 'wallet',
  label: 'Bitcoin',
  description: 'A Bitcoin address, or a wallet by its xpub, ypub or zpub',
  icon: 'https://icons.llamao.fi/icons/chains/rsz_bitcoin.jpg?w=48&h=48',
  config: z.object({
    // Public, so not a secret field; still never logged or shown in full.
    address: field({
      title: 'Address or extended public key',
      description: 'An address (1…, 3…, bc1…) or the xpub, ypub or zpub of a wallet account',
      placeholder: 'bc1q… or zpub…',
    }).superRefine((value, ctx) => {
      const parsed = parseTarget(value)
      if ('error' in parsed) ctx.addIssue({ code: 'custom', message: parsed.error })
    }),
  }),
  maxRequests: (config) => {
    const parsed = parseTarget(config.address)
    return 'error' in parsed ? 0 : paths(parsed).length
  },
  defaultLabel: (config) => `Bitcoin ${shorten(config.address)}`,
  fetchPositions: async ({ config, fetch }) => {
    const answers = await Promise.all(
      paths(target(config.address)).map((path) =>
        fetchJson(fetch, `${BLOCKBOOK}${path}?details=basic`, balanceSchema),
      ),
    )
    const satoshis = answers.reduce((sum, answer) => sum + BigInt(answer.balance), 0n)
    const position: Position = {
      asset: { id: coingeckoId('bitcoin'), symbol: 'BTC', name: 'Bitcoin' },
      amount: fromBaseUnits(satoshis, SATOSHI_DECIMALS),
      kind: 'spot',
    }
    return nonZero([position])
  },
})
