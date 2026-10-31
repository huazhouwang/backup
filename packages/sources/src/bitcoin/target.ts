import { sha256 } from '@noble/hashes/sha2.js'
import { base58check, bech32, bech32m } from '@scure/base'
import { HDKey } from '@scure/bip32'

/** What a bitcoin connection watches: one address, or an account's extended public key. */
export type Target =
  | { type: 'address'; address: string }
  | { type: 'extended'; key: string; prefix: ExtendedPrefix }

export type ExtendedPrefix = 'xpub' | 'ypub' | 'zpub'

const b58check = base58check(sha256)

/** Base58check version bytes of mainnet addresses. */
const P2PKH_VERSION = 0x00
const P2SH_VERSION = 0x05
/** Version byte plus a 20-byte hash. */
const BASE58_ADDRESS_LENGTH = 21

/** BIP32 serialization: 4 version bytes, depth, fingerprint, index, chain code, key. */
const EXTENDED_KEY_LENGTH = 78
/** SLIP-132 version bytes of mainnet extended public keys. */
const EXTENDED_PUBLIC: Record<number, ExtendedPrefix> = {
  0x0488b21e: 'xpub',
  0x049d7cb2: 'ypub',
  0x04b24746: 'zpub',
}
/** The matching private versions (xprv, yprv, zprv): refused, Folio never holds keys. */
const EXTENDED_PRIVATE = new Set([0x0488ade4, 0x049d7878, 0x04b2430c])

const SEGWIT_HRP = 'bc'
/** BIP173: a bech32 string is at most 90 characters. */
const BECH32_MAX_LENGTH = 90
/** BIP141 witness program limits, and the v0 programs (P2WPKH, P2WSH). */
const WITNESS_PROGRAM_MIN = 2
const WITNESS_PROGRAM_MAX = 40
const WITNESS_V0_LENGTHS = new Set([20, 32])
const WITNESS_VERSION_MAX = 16

/** A bech32 (v0) or bech32m (v1+) segwit address, checked per BIP173/BIP350. */
function segwitAddress(value: string): string | undefined {
  const lower = value.toLowerCase()
  if (!lower.startsWith(`${SEGWIT_HRP}1`)) return undefined
  // Witness v0 uses bech32 and later versions bech32m; the wrong one fails its checksum.
  for (const [codec, isV0] of [
    [bech32, true],
    [bech32m, false],
  ] as const) {
    const decoded = codec.decodeUnsafe(value, BECH32_MAX_LENGTH)
    if (!decoded || decoded.prefix !== SEGWIT_HRP || decoded.words.length === 0) continue
    const [version = -1, ...rest] = decoded.words
    if (isV0 !== (version === 0) || version > WITNESS_VERSION_MAX) continue
    const program = bech32.fromWordsUnsafe(rest)
    if (!program) continue
    if (program.length < WITNESS_PROGRAM_MIN || program.length > WITNESS_PROGRAM_MAX) continue
    if (version === 0 && !WITNESS_V0_LENGTHS.has(program.length)) continue
    return lower
  }
  return undefined
}

/**
 * Reads the config value as an address (P2PKH, P2SH, bech32/bech32m) or an extended public key
 * (xpub, ypub, zpub). Returns a message for anything else, without echoing the value.
 */
export function parseTarget(value: string): Target | { error: string } {
  const segwit = segwitAddress(value)
  if (segwit) return { type: 'address', address: segwit }

  let raw: Uint8Array
  try {
    raw = b58check.decode(value)
  } catch {
    return { error: 'Enter a Bitcoin address or an xpub, ypub or zpub' }
  }

  if (raw.length === BASE58_ADDRESS_LENGTH) {
    if (raw[0] === P2PKH_VERSION || raw[0] === P2SH_VERSION) {
      return { type: 'address', address: value }
    }
    return { error: 'This is not a mainnet Bitcoin address' }
  }

  if (raw.length === EXTENDED_KEY_LENGTH) {
    const version = new DataView(raw.buffer, raw.byteOffset).getUint32(0)
    if (EXTENDED_PRIVATE.has(version)) {
      return { error: 'This is a private key: enter the extended public key (xpub) instead' }
    }
    const prefix = EXTENDED_PUBLIC[version]
    if (!prefix) return { error: 'Enter a mainnet xpub, ypub or zpub' }
    try {
      // Checks the key itself (a valid curve point), with the version this key carries.
      HDKey.fromExtendedKey(value, { public: version, private: 0 })
    } catch {
      return { error: 'This extended public key is not valid' }
    }
    return { type: 'extended', key: value, prefix }
  }

  return { error: 'Enter a Bitcoin address or an xpub, ypub or zpub' }
}
