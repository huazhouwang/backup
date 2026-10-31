import { describe, expect, test } from 'vitest'

import { bitcoin } from '../src/bitcoin'
import { contextFor, fixtureFetch, type FixtureRoute } from '../src/testing'
import address from './fixtures/bitcoin/address.json'
import xpubPkh from './fixtures/bitcoin/xpub-pkh.json'
import xpubShWpkh from './fixtures/bitcoin/xpub-sh-wpkh.json'
import xpubTr from './fixtures/bitcoin/xpub-tr.json'
import xpubWpkh from './fixtures/bitcoin/xpub-wpkh.json'
import zpub from './fixtures/bitcoin/zpub.json'

const ADDRESS = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'
// BIP84 and BIP44 account keys of the public test mnemonic "abandon … about".
const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs'
const XPUB =
  'xpub6BosfCnifzxcFwrSzQiqu2DBVTshkCXacvNsWGYJVVhhawA7d4R5WSWGFNbi8Aw6ZRc1brxMyWMzG3DSSSSoekkudhUd9yLb6qx39T9nMdj'

const xpubRoutes = (overrides: Partial<Record<string, unknown>> = {}): FixtureRoute[] => [
  { url: `/xpub/pkh%28${XPUB}%29?details=basic`, json: overrides['pkh'] ?? xpubPkh },
  { url: `/xpub/sh%28wpkh%28${XPUB}%29%29?details=basic`, json: xpubShWpkh },
  { url: `/xpub/wpkh%28${XPUB}%29?details=basic`, json: overrides['wpkh'] ?? xpubWpkh },
  { url: `/xpub/tr%28${XPUB}%29?details=basic`, json: xpubTr },
]

describe('bitcoin', () => {
  test('an address becomes one BTC position', async () => {
    const { fetch, requests } = fixtureFetch([
      { url: `https://btc1.trezor.io/api/v2/address/${ADDRESS}?details=basic`, json: address },
    ])
    const ctx = contextFor(bitcoin, { address: ADDRESS }, fetch)
    expect(await bitcoin.fetchPositions(ctx)).toEqual([
      {
        asset: { id: 'coingecko:bitcoin', symbol: 'BTC', name: 'Bitcoin' },
        amount: '3.94166799',
        kind: 'spot',
      },
    ])
    expect(requests).toHaveLength(1)
    expect(ctx.fetch.budget.used).toBeLessThanOrEqual(bitcoin.maxRequests(ctx.config))
  })

  test('a zpub is sent as it is; an empty wallet has no positions', async () => {
    const { fetch, requests } = fixtureFetch([
      { url: `/api/v2/xpub/${ZPUB}?details=basic`, json: zpub },
    ])
    const ctx = contextFor(bitcoin, { address: ZPUB }, fetch)
    expect(await bitcoin.fetchPositions(ctx)).toEqual([])
    expect(requests).toHaveLength(1)
    expect(bitcoin.maxRequests(ctx.config)).toBe(1)
  })

  test('a bare xpub scans all four script types and sums them', async () => {
    const { fetch, requests } = fixtureFetch(
      xpubRoutes({
        // The recorded wallet is empty; give two script types a balance to check the sum.
        pkh: { ...xpubPkh, balance: '150000000' },
        wpkh: { ...xpubWpkh, balance: '2500' },
      }),
    )
    const ctx = contextFor(bitcoin, { address: XPUB }, fetch)
    expect(await bitcoin.fetchPositions(ctx)).toEqual([
      expect.objectContaining({ amount: '1.500025', kind: 'spot' }),
    ])
    expect(requests).toHaveLength(4)
    expect(ctx.fetch.budget.used).toBe(bitcoin.maxRequests(ctx.config))
    expect(bitcoin.maxRequests(ctx.config)).toBe(4)
  })

  test('the recorded xpub answers parse', async () => {
    const { fetch } = fixtureFetch(xpubRoutes())
    expect(await bitcoin.fetchPositions(contextFor(bitcoin, { address: XPUB }, fetch))).toEqual([])
  })

  test.each([
    ['P2PKH', '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'],
    ['P2SH', '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy'],
    ['P2WPKH', ADDRESS],
    ['P2WPKH, upper case', ADDRESS.toUpperCase()],
    ['P2WSH', 'bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3'],
    ['P2TR', 'bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297'],
    ['xpub', XPUB],
    ['zpub', ZPUB],
  ])('accepts a %s', (_, value) => {
    expect(bitcoin.config.safeParse({ address: value }).success).toBe(true)
  })

  test.each([
    ['a typo in an address', 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlx'],
    ['a typo in a base58 address', '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb'],
    ['a v0 address with a bech32m checksum', 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kemeawh'],
    ['a testnet address', 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'],
    ['an EVM address', '0x47add9a56df66b524d5e2c1993a43cde53b6ed85'],
    ['a truncated xpub', XPUB.slice(0, -1)],
    [
      'an xprv',
      'xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi',
    ],
  ])('rejects %s', (_, value) => {
    expect(bitcoin.config.safeParse({ address: value }).success).toBe(false)
  })

  test('the default label shows only a shortened form', () => {
    expect(bitcoin.defaultLabel({ address: ZPUB })).toBe('Bitcoin zpub6r…tZYs')
    expect(bitcoin.defaultLabel({ address: ADDRESS })).toBe('Bitcoin bc1qxy…0wlh')
  })

  test.each([
    [429, 'rate_limited'],
    [503, 'upstream'],
  ])('maps HTTP %i to %s without echoing the key', async (status, code) => {
    const { fetch } = fixtureFetch([{ url: '/xpub/', status, json: {} }])
    const ctx = contextFor(bitcoin, { address: ZPUB }, fetch)
    const error = await bitcoin.fetchPositions(ctx).catch((caught: unknown) => caught)
    expect(error).toMatchObject({ name: 'SourceError', code })
    expect(String(error)).not.toContain(ZPUB)
  })

  test('never logs the address or key', async () => {
    const { fetch } = fixtureFetch(xpubRoutes())
    const ctx = contextFor(bitcoin, { address: XPUB }, fetch)
    await bitcoin.fetchPositions(ctx)
    expect(ctx.log.lines.join('\n')).not.toContain(XPUB.slice(4, 20))
  })
})
