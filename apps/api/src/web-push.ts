/**
 * Web Push with WebCrypto only: VAPID (RFC 8292) and aes128gcm payload encryption (RFC 8291).
 * Native apps will deliver through APNs / FCM instead; reminder scheduling doesn't depend on
 * this module.
 */
import { base64UrlDecode, base64UrlEncode } from '@lullabo/shared'

export interface PushTarget {
  endpoint: string
  /** Browser's P-256 public key, base64url (uncompressed point). */
  p256dh: string
  /** Browser's 16-byte auth secret, base64url. */
  auth: string
}

export interface VapidKeys {
  /** Uncompressed P-256 public key, base64url; given to browsers as applicationServerKey. */
  publicKey: string
  /** Private key as a JWK (P-256, with d). */
  privateJwk: JsonWebKey
}

const encoder = new TextEncoder()
const encode = (text: string) => new Uint8Array(encoder.encode(text))

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

async function generatePair(
  algorithm: SubtleCryptoGenerateKeyAlgorithm,
  usages: string[],
): Promise<CryptoKeyPair> {
  const result = await crypto.subtle.generateKey(algorithm, true, usages)
  if (!('privateKey' in result)) throw new Error('Expected a key pair')
  return result
}

async function exportRaw(key: CryptoKey): Promise<Uint8Array<ArrayBuffer>> {
  const exported = await crypto.subtle.exportKey('raw', key)
  if (!(exported instanceof ArrayBuffer)) throw new Error('Expected raw key bytes')
  return new Uint8Array(exported)
}

async function exportJwk(key: CryptoKey): Promise<JsonWebKey> {
  const exported = await crypto.subtle.exportKey('jwk', key)
  if (exported instanceof ArrayBuffer) throw new Error('Expected a JWK')
  return exported
}

/** A new VAPID key pair, created once and kept for the life of the deployment. */
export async function generateVapidKeys(): Promise<VapidKeys> {
  const pair = await generatePair({ name: 'ECDSA', namedCurve: 'P-256' }, ['sign', 'verify'])
  return {
    publicKey: base64UrlEncode(await exportRaw(pair.publicKey)),
    privateJwk: await exportJwk(pair.privateKey),
  }
}

/** Authorization header value for a push service, valid for 12 hours. */
export async function vapidAuthorization(
  endpoint: string,
  keys: VapidKeys,
  subject: string,
  now: number,
): Promise<string> {
  const header = base64UrlEncode(encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = base64UrlEncode(
    encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(now / 1000) + 12 * 3600,
        sub: subject,
      }),
    ),
  )
  const key = await crypto.subtle.importKey(
    'jwk',
    keys.privateJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  // WebCrypto ECDSA signatures are already the raw r||s form JWS wants.
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    encode(`${header}.${claims}`),
  )
  return `vapid t=${header}.${claims}.${base64UrlEncode(signature)}, k=${keys.publicKey}`
}

async function hkdf(
  salt: Uint8Array<ArrayBuffer>,
  ikm: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  bytes: number,
) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    bytes * 8,
  )
  return new Uint8Array(bits)
}

/** Encrypts a payload for one subscription as a single aes128gcm record. */
export async function encryptPayload(
  target: Pick<PushTarget, 'p256dh' | 'auth'>,
  payload: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const uaPublic = base64UrlDecode(target.p256dh)
  const authSecret = base64UrlDecode(target.auth)
  const local = await generatePair({ name: 'ECDH', namedCurve: 'P-256' }, ['deriveBits'])
  const asPublic = await exportRaw(local.publicKey)
  const uaKey = await crypto.subtle.importKey(
    'raw',
    uaPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  // Not inlined: the workers types name the property `$public`, the runtime reads `public`.
  const ecdh = { name: 'ECDH', public: uaKey }
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits(ecdh, local.privateKey, 256))
  const ikm = await hkdf(
    authSecret,
    ecdhSecret,
    concat(encode('WebPush: info\0'), uaPublic, asPublic),
    32,
  )
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, encode('Content-Encoding: nonce\0'), 12)
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  // A single record: the payload followed by the last-record delimiter.
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    aesKey,
    concat(payload, new Uint8Array([2])),
  )
  const recordSize = new Uint8Array(4)
  new DataView(recordSize.buffer).setUint32(0, 4096)
  return concat(
    salt,
    recordSize,
    new Uint8Array([asPublic.length]),
    asPublic,
    new Uint8Array(ciphertext),
  )
}

export type PushResult = 'sent' | 'gone' | 'failed'

/**
 * Sends one notification. 'gone' means the subscription expired or was revoked and should be
 * deleted.
 */
export async function sendPush(
  target: PushTarget,
  message: unknown,
  keys: VapidKeys,
  subject: string,
  now: number,
  fetcher: typeof fetch = fetch,
): Promise<PushResult> {
  try {
    // Inside the try: a subscription with keys that don't import fails alone, not the batch.
    const body = await encryptPayload(target, encode(JSON.stringify(message)))
    const res = await fetcher(target.endpoint, {
      method: 'POST',
      headers: {
        Authorization: await vapidAuthorization(target.endpoint, keys, subject, now),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        // A reminder is useless a few hours late.
        TTL: String(4 * 3600),
        Urgency: 'high',
      },
      body,
    })
    if (res.status === 404 || res.status === 410) return 'gone'
    return res.ok ? 'sent' : 'failed'
  } catch {
    return 'failed'
  }
}
