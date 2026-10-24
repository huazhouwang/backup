/**
 * Passwords are slow-hashed on device: PBKDF2-SHA256 with 600k iterations (OWASP recommendation), salt is "plinth:" + email.
 * The server receives the derived key; the raw password never leaves the device. The server adds a random salt and stores one more SHA-256 (see server/password.ts).
 */
export const MIN_PASSWORD = 8;
const ITERATIONS = 600_000;

export async function derivePassword(email: string, password: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(`plinth:${email.trim().toLowerCase()}`), iterations: ITERATIONS },
    key,
    256,
  );
  return [...new Uint8Array(bits)].map(x => x.toString(16).padStart(2, '0')).join('');
}
