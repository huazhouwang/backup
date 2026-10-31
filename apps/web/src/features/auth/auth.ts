import type { MeResponse } from '@folio/shared'
import { queryOptions } from '@tanstack/react-query'

import { ApiError, api } from '../../lib/api'
import { m } from '../../paraglide/messages.js'
import { derivePasswordKey, normalizeEmail } from './password'

/** The signed-in user, or null when signed out. */
export const meQuery = queryOptions({
  queryKey: ['me'],
  queryFn: async (): Promise<MeResponse | null> => {
    try {
      return await api<MeResponse>('/api/me')
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null
      throw error
    }
  },
  staleTime: 5 * 60_000,
})

export async function signIn(email: string, password: string) {
  const normalized = normalizeEmail(email)
  await api('/api/auth/sign-in/email', {
    method: 'POST',
    json: { email: normalized, password: await derivePasswordKey(normalized, password) },
  })
}

export async function signUp(email: string, password: string) {
  const normalized = normalizeEmail(email)
  await api('/api/auth/sign-up/email', {
    method: 'POST',
    json: { email: normalized, password: await derivePasswordKey(normalized, password), name: '' },
  })
}

export async function signOut() {
  await api('/api/auth/sign-out', { method: 'POST', json: {} })
}

/** Readable messages for the auth error codes Better Auth answers with. */
export function authErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'INVALID_EMAIL_OR_PASSWORD') return m.authWrongPassword()
    if (error.code.startsWith('USER_ALREADY_EXISTS')) return m.authEmailTaken()
    if (error.code === 'INVALID_EMAIL') return m.authInvalidEmail()
    if (error.status === 429) return m.authTooManyAttempts()
  }
  return m.errorGeneric()
}
