import { type FamilySummary, canAddBabies } from '@lullabo/shared'

import type { LocalStore } from '../../db'
import { HttpError, apiFetch } from '../../lib/api'
import { claimLocalData, setAccount, setCursor, unclaimedCount } from '../../sync/local'
import { derivePasswordKey, normalizeEmail } from './password'

export interface SessionUser {
  id: string
  name: string
  email: string
  image: string | null
}

export interface AccountApi {
  me: () => Promise<SessionUser | null>
  families: () => Promise<FamilySummary[]>
  createFamily: (name: string) => Promise<FamilySummary>
}

export const httpAccountApi: AccountApi = {
  async me() {
    try {
      return await apiFetch<SessionUser>('/api/me')
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) return null
      throw error
    }
  },
  families: () => apiFetch<FamilySummary[]>('/api/families'),
  createFamily: (name) =>
    apiFetch<FamilySummary>('/api/families', { method: 'POST', body: JSON.stringify({ name }) }),
}

/** The sign-in options this deployment is set up for. */
export interface SignInOptionsInfo {
  google: boolean
  passwordReset: boolean
}

export const fetchSignInOptions = () => apiFetch<SignInOptionsInfo>('/api/sign-in-options')

/** How the signed-in account can sign in. */
export interface SignInMethods {
  google: boolean
  password: boolean
  passkeys: number
}

export const fetchSignInMethods = () => apiFetch<SignInMethods>('/api/account')

export async function updateName(name: string) {
  await apiFetch('/api/auth/update-user', {
    method: 'POST',
    body: JSON.stringify({ name: name.trim() }),
  })
}

export async function changePassword(email: string, current: string, next: string) {
  const [currentPassword, newPassword] = await Promise.all([
    derivePasswordKey(email, current),
    derivePasswordKey(email, next),
  ])
  await apiFetch('/api/auth/change-password', {
    method: 'POST',
    // Signs out every other device, in case someone else knew the old password.
    body: JSON.stringify({ currentPassword, newPassword, revokeOtherSessions: true }),
  })
}

/** Starts Google sign-in; the browser leaves the app and returns to `returnTo`. */
export async function signInWithGoogle(returnTo = '/settings/account') {
  const { url } = await apiFetch<{ url: string }>('/api/auth/sign-in/social', {
    method: 'POST',
    body: JSON.stringify({ provider: 'google', callbackURL: returnTo }),
  })
  window.location.assign(url)
}

/** Creates an account; the session cookie is set by the response. */
export async function signUpWithEmail(email: string, password: string, name: string) {
  await apiFetch('/api/auth/sign-up/email', {
    method: 'POST',
    body: JSON.stringify({
      email: normalizeEmail(email),
      password: await derivePasswordKey(email, password),
      name: name.trim(),
    }),
  })
}

export async function signInWithEmail(email: string, password: string) {
  await apiFetch('/api/auth/sign-in/email', {
    method: 'POST',
    body: JSON.stringify({
      email: normalizeEmail(email),
      password: await derivePasswordKey(email, password),
    }),
  })
}

/** Emails a reset code; the server answers the same whether or not the address exists. */
export async function requestPasswordReset(email: string) {
  await apiFetch('/api/auth/email-otp/request-password-reset', {
    method: 'POST',
    body: JSON.stringify({ email: normalizeEmail(email) }),
  })
}

export async function resetPassword(email: string, otp: string, password: string) {
  await apiFetch('/api/auth/email-otp/reset-password', {
    method: 'POST',
    body: JSON.stringify({
      email: normalizeEmail(email),
      otp,
      password: await derivePasswordKey(email, password),
    }),
  })
}

export async function signOutRemote() {
  await apiFetch('/api/auth/sign-out', { method: 'POST', body: '{}' })
}

/** Permanently deletes the account on the server (shared families are kept). */
export async function deleteAccountRemote() {
  await apiFetch<void>('/api/account', { method: 'DELETE' })
}

/** Babies and events created while signed out (not yet in any family). */
export type ConnectResult =
  | { status: 'signed-out' }
  /** Linked; `family` is where new babies go by default, if the account has one. */
  | { status: 'connected'; family: FamilySummary | undefined }
  /** The account already has a family and this device has its own records: ask the user. */
  | { status: 'choose'; families: FamilySummary[]; user: SessionUser }

/**
 * Links a signed-in account to this device. This device's own records go into a new family
 * named after the user; without any, nothing is created, so someone who only looks after
 * other families' babies doesn't get an empty family of their own.
 */
export async function connectAccount(
  store: LocalStore,
  api: AccountApi,
  familyName: (user: SessionUser) => string,
): Promise<ConnectResult> {
  const user = await api.me()
  if (!user) return { status: 'signed-out' }
  const families = await api.families()
  const unclaimed = unclaimedCount(store)
  if (families.length > 0 && unclaimed > 0) return { status: 'choose', families, user }
  const family =
    families.find(canAddBabies) ??
    (unclaimed > 0 ? await api.createFamily(familyName(user)) : undefined)
  completeConnect(store, user, family)
  return { status: 'connected', family }
}

/** Finishes linking, with the chosen family for this device's records (if any). */
export function completeConnect(
  store: LocalStore,
  user: SessionUser,
  family: FamilySummary | undefined,
) {
  if (family) claimLocalData(store, family.id)
  setAccount(store, { userId: user.id, userName: user.name, familyId: family?.id ?? null })
}

/** Forgets the account on this device; optionally removes all local records too. */
export function disconnectLocal(store: LocalStore, clearData: boolean) {
  setAccount(store, undefined)
  // A later sign-in (possibly another account) starts from a full pull.
  setCursor(store, '')
  if (!clearData) return
  for (const collection of [store.events, store.babies, store.outbox] as const) {
    const keys = [...collection.keys()]
    if (keys.length > 0) collection.delete(keys)
  }
}
