/**
 * On the server a password only gets "random salt + SHA-256".
 * The slow hash (PBKDF2-SHA256, 600k iterations, the OWASP recommendation) runs on the user's device, see lib/password.ts:
 * a free-plan Worker has only 10 ms CPU per request, too little for a slow hash; as a bonus the raw password never leaves the device.
 * If the database leaks, every guess still costs the attacker the full 600k iterations.
 */
const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const unhex = (s: string) => Uint8Array.from(s.match(/../g) ?? [], h => parseInt(h, 16));

async function digest(salt: Uint8Array, input: string) {
  const data = new Uint8Array([...salt, ...new TextEncoder().encode(input)]);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data));
}

/** Stored as s256$salt$digest */
export async function hashPassword(input: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `s256$${hex(salt)}$${hex(await digest(salt, input))}`;
}

export async function verifyPassword({ hash, password }: { hash: string; password: string }) {
  const [kind, salt, want] = hash.split('$');
  if (kind !== 's256' || !salt || !want) return false;
  const got = await digest(unhex(salt), password);
  const expect = unhex(want);
  if (got.length !== expect.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ expect[i];
  return diff === 0;
}

/** Client-derived value: 32 bytes as 64 hex characters */
export const DERIVED_LENGTH = 64;
