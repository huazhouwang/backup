/** Model API key encryption: AES-GCM with the master key from KEY_ENCRYPTION_SECRET; decrypted only on the server. */
import { env } from 'cloudflare:workers';

let keyPromise: Promise<CryptoKey> | null = null;

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

/** A 32-byte base64 value is used as is; any other random string is hashed with SHA-256, so a password-generator value pasted in the dashboard works */
async function rawKey(secret: string) {
  try {
    const raw = unb64(secret);
    if (raw.length === 32) return raw;
  } catch {}
  if (secret.length < 24) throw new Error('KEY_ENCRYPTION_SECRET is too short (at least 24 characters)');
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)));
}

function masterKey() {
  if (!env.KEY_ENCRYPTION_SECRET) throw new Error('KEY_ENCRYPTION_SECRET is not configured');
  keyPromise ??= rawKey(env.KEY_ENCRYPTION_SECRET).then(k => crypto.subtle.importKey('raw', k, 'AES-GCM', false, ['encrypt', 'decrypt']));
  return keyPromise;
}

export async function encryptSecret(plain: string, aad: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(aad) },
    await masterKey(),
    new TextEncoder().encode(plain),
  );
  return { ciphertext: b64(ct), iv: b64(iv) };
}

export async function decryptSecret(ciphertext: string, iv: string, aad: string) {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(iv), additionalData: new TextEncoder().encode(aad) },
    await masterKey(),
    unb64(ciphertext),
  );
  return new TextDecoder().decode(pt);
}

/** Show only the last 4 characters */
export const keyHint = (key: string) => `…${key.slice(-4)}`;
