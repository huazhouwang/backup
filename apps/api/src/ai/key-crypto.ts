import { base64UrlDecode, base64UrlEncode } from '@lullabo/shared'

// Provider keys are encrypted at rest with a key derived from ENCRYPTION_SECRET.

async function cipherKey(secret: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    'HKDF',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      // From when the app was called Bobo; changing it would make saved keys unreadable.
      info: new TextEncoder().encode('bobo ai key'),
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptKey(secret: string, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await cipherKey(secret),
    new TextEncoder().encode(plain),
  )
  const out = new Uint8Array(iv.length + sealed.byteLength)
  out.set(iv)
  out.set(new Uint8Array(sealed), iv.length)
  return base64UrlEncode(out)
}

export async function decryptKey(secret: string, sealed: string): Promise<string> {
  const bytes = base64UrlDecode(sealed)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytes.slice(0, 12) },
    await cipherKey(secret),
    bytes.slice(12),
  )
  return new TextDecoder().decode(plain)
}

/** "sk-…a3f9": enough to recognise a key, not enough to use it. */
export function keyHint(apiKey: string): string {
  const prefix = apiKey.startsWith('sk-or-') ? 'sk-or-' : apiKey.startsWith('sk-') ? 'sk-' : ''
  return `${prefix}…${apiKey.slice(-4)}`
}
