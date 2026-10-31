import { Big } from 'big.js'
import { describe, expect, test } from 'vitest'

import { hyperliquid } from '../src/hyperliquid'
import type { Position } from '../src/position'
import { contextFor, fixtureFetch, type FixtureRoute } from '../src/testing'
import clearinghouse from './fixtures/hyperliquid/clearinghouse-state.json'
import isolatedClearinghouse from './fixtures/hyperliquid/isolated-clearinghouse-state.json'
import isolatedSpot from './fixtures/hyperliquid/isolated-spot-clearinghouse-state.json'
import spotState from './fixtures/hyperliquid/spot-clearinghouse-state.json'
import spotMeta from './fixtures/hyperliquid/spot-meta-and-asset-ctxs.json'
import abstraction from './fixtures/hyperliquid/user-abstraction.json'

const ADDRESS = '0x47add9a56df66b524d5e2c1993a43cde53b6ed85'
const INFO = 'https://api.hyperliquid.xyz/info'

const query = (type: string) => (body: string) =>
  (JSON.parse(body) as { type?: string }).type === type

function routes(answers: {
  mode?: unknown
  perps?: unknown
  spot?: unknown
  status?: number
}): FixtureRoute[] {
  const route = (type: string, json: unknown): FixtureRoute => ({
    url: INFO,
    method: 'POST',
    body: query(type),
    status: answers.status,
    json,
  })
  return [
    route('userAbstraction', answers.mode ?? abstraction),
    route('clearinghouseState', answers.perps ?? clearinghouse),
    route('spotClearinghouseState', answers.spot ?? spotState),
    route('spotMetaAndAssetCtxs', spotMeta),
  ]
}

const sumValues = (positions: Position[]) =>
  positions.reduce(
    (sum, position) =>
      sum.plus(new Big(position.valueUsd ?? 0).times(position.kind === 'borrowed' ? -1 : 1)),
    new Big(0),
  )

const perpSide = (positions: Position[]) =>
  positions.filter((position) => position.kind === 'perp' || position.location === 'perp margin')

describe('hyperliquid', () => {
  test('perps, free collateral and spot balances of a unified account', async () => {
    const { fetch, requests } = fixtureFetch(routes({}))
    const ctx = contextFor(hyperliquid, { address: ADDRESS }, fetch)
    const positions = await hyperliquid.fetchPositions(ctx)

    expect(positions).toEqual([
      {
        asset: { id: 'coingecko:bitcoin', symbol: 'BTC' },
        amount: '0.39786',
        kind: 'perp',
        valueUsd: 3872.61976,
        perp: {
          side: 'short',
          size: '0.39786',
          entryPrice: 74245.2,
          markPrice: 77414,
          unrealizedPnlUsd: -1260.70258,
          marginUsd: 5133.32234,
          leverage: 6,
          liquidationPrice: 233523.0952385385,
        },
      },
      {
        asset: { id: 'coingecko:ethereum', symbol: 'ETH' },
        amount: '0.6648',
        kind: 'perp',
        valueUsd: 365.04668,
        perp: {
          side: 'long',
          size: '0.6648',
          entryPrice: 2256.14,
          markPrice: 2244.2,
          unrealizedPnlUsd: -7.93936,
          marginUsd: 372.98604,
          leverage: 4,
        },
      },
      {
        asset: { id: 'coingecko:solana', symbol: 'SOL' },
        amount: '34.25',
        kind: 'perp',
        valueUsd: 413.41314,
        perp: {
          side: 'long',
          size: '34.25',
          entryPrice: 99.5818,
          markPrice: 95.702,
          unrealizedPnlUsd: -132.885776,
          marginUsd: 546.298916,
          leverage: 6,
        },
      },
      {
        asset: { id: 'coingecko:usd-coin', symbol: 'USDC', name: 'USD Coin' },
        amount: '2375.248777',
        kind: 'spot',
        location: 'perp margin',
        valueUsd: 2375.248777,
      },
      {
        // The unified USDC balance minus the perp account value it already contains.
        asset: { id: 'coingecko:usd-coin', symbol: 'USDC', name: 'USD Coin' },
        amount: '59003.23646968',
        kind: 'spot',
        location: 'spot',
        valueUsd: 59003.23646968,
      },
      {
        asset: { id: 'coingecko:hyperliquid', symbol: 'HYPE' },
        amount: '9.90515291',
        kind: 'spot',
        location: 'spot',
      },
      {
        asset: { id: 'hyperliquid:UBTC', symbol: 'UBTC', name: 'Unit Bitcoin' },
        amount: '0.209914648',
        kind: 'spot',
        location: 'spot',
        priceUsd: 77342,
      },
      {
        asset: { id: 'coingecko:ethena-usde', symbol: 'USDE' },
        amount: '0.0160567',
        kind: 'spot',
        location: 'spot',
      },
      {
        asset: { id: 'hyperliquid:USOL', symbol: 'USOL', name: 'Unit Solana' },
        amount: '23.38581572',
        kind: 'spot',
        location: 'spot',
        priceUsd: 95.632,
      },
    ])
    expect(requests).toHaveLength(4)
    expect(ctx.fetch.budget.used).toBeLessThanOrEqual(hyperliquid.maxRequests(ctx.config))
  })

  test('perp equity plus free collateral adds up to the account value', async () => {
    const { fetch } = fixtureFetch(routes({}))
    const positions = await hyperliquid.fetchPositions(
      contextFor(hyperliquid, { address: ADDRESS }, fetch),
    )
    expect(sumValues(perpSide(positions)).toNumber()).toBeCloseTo(
      Number(clearinghouse.marginSummary.accountValue),
      6,
    )
    // In a unified account the whole USDC balance is the spot USDC plus the perp side.
    const usdc = positions.filter((position) => position.asset.id === 'coingecko:usd-coin')
    expect(sumValues(usdc).toFixed()).toBe(
      new Big(spotState.balances[0]!.total)
        .minus(sumValues(positions.filter((position) => position.kind === 'perp')))
        .toFixed(),
    )
  })

  test('an isolated position counts its margin, which already holds the PnL', async () => {
    const { fetch, requests } = fixtureFetch(
      routes({ perps: isolatedClearinghouse, spot: isolatedSpot }),
    )
    const positions = await hyperliquid.fetchPositions(
      contextFor(hyperliquid, { address: ADDRESS }, fetch),
    )
    expect(positions).toEqual([
      expect.objectContaining({
        asset: { id: 'coingecko:solana', symbol: 'SOL' },
        kind: 'perp',
        valueUsd: 1525.737147,
        perp: expect.objectContaining({ side: 'long', size: '100', markPrice: 95.702 }),
      }),
      // No free collateral: the account value is the isolated margin.
      expect.objectContaining({ amount: '119032.94159058', location: 'spot' }),
    ])
    expect(sumValues(perpSide(positions)).toNumber()).toBeCloseTo(
      Number(isolatedClearinghouse.marginSummary.accountValue),
      6,
    )
    // Only USDC on spot: no price lookup.
    expect(requests).toHaveLength(3)
  })

  test('in the default mode spot and perps are separate ledgers', async () => {
    const { fetch } = fixtureFetch(routes({ mode: 'default' }))
    const positions = await hyperliquid.fetchPositions(
      contextFor(hyperliquid, { address: ADDRESS }, fetch),
    )
    expect(positions.find((position) => position.location === 'spot')).toMatchObject({
      asset: { id: 'coingecko:usd-coin' },
      amount: '66029.56482668',
    })
  })

  test('a unified USDC balance below the perp value shows as borrowed USDC', async () => {
    const spot = { balances: [{ coin: 'USDC', token: 0, total: '7000.0', hold: '0.0' }] }
    const { fetch } = fixtureFetch(routes({ spot }))
    const positions = await hyperliquid.fetchPositions(
      contextFor(hyperliquid, { address: ADDRESS }, fetch),
    )
    expect(positions.at(-1)).toMatchObject({ amount: '26.328357', kind: 'borrowed' })
  })

  test('sends the address lower-cased in every query', async () => {
    const { fetch, requests } = fixtureFetch(routes({}))
    await hyperliquid.fetchPositions(
      contextFor(hyperliquid, { address: ADDRESS.toUpperCase().replace('0X', '0x') }, fetch),
    )
    for (const request of requests.filter((entry) => entry.body.includes('user'))) {
      expect(JSON.parse(request.body)).toMatchObject({ user: ADDRESS })
    }
  })

  test.each([
    ['too short', '0x47add9a56df66b524d5e2c1993a43cde53b6ed8'],
    ['not hex', '0x47add9a56df66b524d5e2c1993a43cde53b6ed8z'],
    ['no prefix', '47add9a56df66b524d5e2c1993a43cde53b6ed85'],
  ])('rejects an address that is %s', (_, address) => {
    expect(hyperliquid.config.safeParse({ address }).success).toBe(false)
  })

  test('the default label shortens the address', () => {
    expect(hyperliquid.defaultLabel({ address: ADDRESS })).toBe('Hyperliquid 0x47ad…ed85')
  })

  test.each([
    [429, 'rate_limited'],
    [500, 'upstream'],
  ])('maps HTTP %i to %s', async (status, code) => {
    const { fetch } = fixtureFetch(routes({ status }))
    const error = await hyperliquid
      .fetchPositions(contextFor(hyperliquid, { address: ADDRESS }, fetch))
      .catch((caught: unknown) => caught)
    expect(error).toMatchObject({ name: 'SourceError', code })
  })

  test('an unexpected answer is an upstream error', async () => {
    const { fetch } = fixtureFetch(routes({ perps: { assetPositions: 'none' } }))
    await expect(
      hyperliquid.fetchPositions(contextFor(hyperliquid, { address: ADDRESS }, fetch)),
    ).rejects.toMatchObject({ code: 'upstream' })
  })
})
