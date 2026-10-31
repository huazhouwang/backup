import { Big } from 'big.js'
import { z } from 'zod'

import { type AssetRef, coingeckoId } from '../asset'
import { defineSource, field } from '../define'
import { fetchJson, type FetchLike } from '../fetch'
import { nonZero, type Position } from '../position'
import { toDecimal } from '../units'
import {
  abstractionSchema,
  clearinghouseSchema,
  type SpotMeta,
  spotMetaSchema,
  spotStateSchema,
} from './schemas'

/** Hyperliquid's keyless info API: every query is a POST with a `type`. */
const INFO_URL = 'https://api.hyperliquid.xyz/info'
/** The token index of USDC, the quote of every priced spot pair and the perp collateral. */
const USDC_TOKEN = 0

/**
 * Account modes in which spot balances back the perps: the spot USDC balance then already holds
 * the perp account's value (marked to market, verified against the live API), so it is not
 * counted twice. In the other modes (`default`, `disabled`, `dexAbstraction`) spot and perps
 * are separate ledgers.
 */
const SHARED_COLLATERAL = new Set(['unifiedAccount', 'portfolioMargin'])

/** Perp coins with a CoinGecko id; the rest stay `hyperliquid:<coin>` (e.g. kPEPE is 1000 PEPE). */
const PERP_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  HYPE: 'hyperliquid',
  XRP: 'ripple',
  DOGE: 'dogecoin',
  BNB: 'binancecoin',
  AVAX: 'avalanche-2',
  LINK: 'chainlink',
  ADA: 'cardano',
  SUI: 'sui',
  LTC: 'litecoin',
  AAVE: 'aave',
  NEAR: 'near',
  TRX: 'tron',
  DOT: 'polkadot',
  ZEC: 'zcash',
}

/**
 * Spot tokens with a CoinGecko id. Bridged tokens (UBTC, UETH, USOL…) keep their own identity
 * and the venue's price, like wrapped tokens elsewhere.
 */
const SPOT_IDS: Record<string, string> = {
  USDC: 'usd-coin',
  HYPE: 'hyperliquid',
  USDT0: 'usdt0',
  USDE: 'ethena-usde',
  PURR: 'purr-2',
}

const USDC: AssetRef = { id: coingeckoId('usd-coin'), symbol: 'USDC', name: 'USD Coin' }

const venueId = (coin: string) => `hyperliquid:${coin}`

const shorten = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`

function info<T extends z.ZodType>(fetch: FetchLike, body: Record<string, string>, schema: T) {
  return fetchJson(fetch, INFO_URL, schema, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** A USD amount as a position: held when positive, owed when negative. */
function usdcPosition(amount: Big, location: string): Position {
  return {
    asset: USDC,
    amount: amount.abs().toFixed(),
    kind: amount.lt(0) ? 'borrowed' : 'spot',
    location,
    valueUsd: amount.abs().toNumber(),
  }
}

/** Each token's price in USDC, from its first USDC pair's mark price. */
function spotPrices([meta, contexts]: SpotMeta): Map<number, { price: number; name?: string }> {
  const marks = new Map(contexts.map((context) => [context.coin, context.markPx]))
  const names = new Map(meta.tokens.map((token) => [token.index, token.fullName ?? undefined]))
  const prices = new Map<number, { price: number; name?: string }>()
  for (const pair of meta.universe) {
    const [base, quote] = pair.tokens
    const mark = marks.get(pair.name)
    if (quote !== USDC_TOKEN || prices.has(base) || !mark) continue
    prices.set(base, { price: Number(mark), name: names.get(base) })
  }
  return prices
}

export const hyperliquid = defineSource({
  id: 'hyperliquid',
  kind: 'perp',
  label: 'Hyperliquid',
  description: 'Perp positions and spot balances of a Hyperliquid account',
  icon: 'https://icons.llamao.fi/icons/protocols/hyperliquid?w=48&h=48',
  config: z.object({
    address: field({
      title: 'Address',
      description: 'The account address (the master account, not an API wallet)',
      placeholder: '0x…',
    }).regex(/^0x[0-9a-fA-F]{40}$/, 'Enter a 0x address of 40 hex characters'),
  }),
  // Mode, perp state, spot state, and spot prices when a token has no CoinGecko id.
  maxRequests: () => 4,
  defaultLabel: (config) => `Hyperliquid ${shorten(config.address)}`,
  fetchPositions: async ({ config, fetch }) => {
    const user = config.address.toLowerCase()
    const [mode, perps, spot] = await Promise.all([
      info(fetch, { type: 'userAbstraction', user }, abstractionSchema),
      info(fetch, { type: 'clearinghouseState', user }, clearinghouseSchema),
      info(fetch, { type: 'spotClearinghouseState', user }, spotStateSchema),
    ])
    const positions: Position[] = []
    const accountValue = new Big(perps.marginSummary.accountValue)

    // Each perp counts its equity: cross margin plus PnL, or the isolated margin (which
    // already includes PnL). What is left of the account value is free collateral.
    let committed = new Big(0)
    for (const { position } of perps.assetPositions) {
      const signed = new Big(position.szi)
      if (signed.eq(0)) continue
      const size = signed.abs()
      const pnl = new Big(position.unrealizedPnl)
      const margin = new Big(position.marginUsed)
      const equity = position.leverage.type === 'isolated' ? margin : margin.plus(pnl)
      committed = committed.plus(equity)
      const markPrice = new Big(position.positionValue).div(size).toNumber()
      const known = PERP_IDS[position.coin]
      positions.push({
        asset: {
          id: known ? coingeckoId(known) : venueId(position.coin),
          symbol: position.coin,
        },
        amount: size.toFixed(),
        kind: 'perp',
        priceUsd: known ? undefined : markPrice,
        valueUsd: equity.toNumber(),
        perp: {
          side: signed.gt(0) ? 'long' : 'short',
          size: size.toFixed(),
          entryPrice: Number(position.entryPx),
          markPrice,
          unrealizedPnlUsd: pnl.toNumber(),
          marginUsd: margin.toNumber(),
          leverage: position.leverage.value,
          liquidationPrice:
            position.liquidationPx === null ? undefined : Number(position.liquidationPx),
        },
      })
    }
    const free = accountValue.minus(committed)
    if (!free.eq(0)) positions.push(usdcPosition(free, 'perp margin'))

    const shared = SHARED_COLLATERAL.has(mode)
    const balances = spot.balances.filter((balance) => !new Big(balance.total).eq(0))
    const needsPrices = balances.some(
      (balance) => balance.token !== USDC_TOKEN && !SPOT_IDS[balance.coin],
    )
    const prices = needsPrices
      ? spotPrices(await info(fetch, { type: 'spotMetaAndAssetCtxs' }, spotMetaSchema))
      : new Map<number, { price: number; name?: string }>()

    for (const balance of balances) {
      if (balance.token === USDC_TOKEN) {
        const total = new Big(balance.total)
        const own = shared ? total.minus(accountValue) : total
        if (!own.eq(0)) positions.push(usdcPosition(own, 'spot'))
        continue
      }
      const known = SPOT_IDS[balance.coin]
      const venue = prices.get(balance.token)
      positions.push({
        asset: {
          id: known ? coingeckoId(known) : venueId(balance.coin),
          symbol: balance.coin,
          name: known ? undefined : venue?.name,
        },
        amount: toDecimal(balance.total),
        kind: 'spot',
        location: 'spot',
        priceUsd: known ? undefined : venue?.price,
      })
    }
    return nonZero(positions)
  },
})
