import { type FamilySummary } from '@lullabo/shared'

import type { LocalStore } from '../../db'
import { createStore, useStore } from '../../lib/store'
import { getAccount, unclaimedCount } from '../../sync/local'
import { ownFamilyName, requestSync } from '../../sync/runner'
import { type SessionUser, completeConnect, connectAccount, httpAccountApi } from './account'

/** Pending "where should this device's records go?" decision after signing in. */
export interface ClaimChoice {
  user: SessionUser
  families: FamilySummary[]
  unclaimed: number
}

const claimChoice = createStore<ClaimChoice | null>(null)

export const useClaimChoice = (): ClaimChoice | null => useStore(claimChoice)

/** Links the session to this device if signed in and not linked yet (e.g. after OAuth). */
export async function connectIfSignedIn(store: LocalStore) {
  if (getAccount(store)) return
  try {
    const result = await connectAccount(store, httpAccountApi, ownFamilyName)
    if (result.status === 'connected') await requestSync()
    if (result.status === 'choose') {
      claimChoice.set({
        user: result.user,
        families: result.families,
        unclaimed: unclaimedCount(store),
      })
    }
  } catch (error) {
    // Offline or server unavailable: try again on the next app start.
    console.warn('Could not link the account', error)
  }
}

export async function resolveClaimChoice(store: LocalStore, family: FamilySummary | 'new') {
  const choice = claimChoice.get()
  if (!choice) return
  const { user } = choice
  const target = family === 'new' ? await httpAccountApi.createFamily(ownFamilyName(user)) : family
  completeConnect(store, user, target)
  claimChoice.set(null)
  await requestSync()
}

/**
 * Picks up a sign-in finished in another window of the app. On iPhone, Google sign-in from
 * the installed app runs in a separate browser sheet: the session and the local database
 * are shared, but this window's copy of the data is not told, so it would stay signed out
 * until restarted. When the app comes back into view (or back from the page cache) while
 * signed out here, ask the server; if there is a session, start over from the saved data,
 * which also links the account if the other window hadn't.
 */
export function reloadWhenSignedInElsewhere(store: LocalStore, joining: () => boolean) {
  const check = async () => {
    // Signed in but deliberately not linked yet: choosing where records go, or joining.
    if (getAccount(store) || claimChoice.get() || joining()) {
      return
    }
    try {
      if (await httpAccountApi.me()) window.location.reload()
    } catch {
      // Offline: nothing to pick up yet.
    }
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') void check()
  }
  const onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) void check()
  }
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('pageshow', onPageShow)
  return () => {
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('pageshow', onPageShow)
  }
}
