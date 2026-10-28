import type { InvitePreview } from '@lullabo/shared'
import { useMutation } from '@tanstack/react-query'
import { useEffect } from 'react'

import { useLocalStore } from '../../db'
import { HttpError } from '../../lib/api'
import { getAccount } from '../../sync/local'
import { requestSync } from '../../sync/runner'
import { httpAccountApi, signInWithGoogle } from '../account/account'
import { connectIfSignedIn } from '../account/connection'
import { familyApi } from './api'

// Set before leaving for Google sign-in, so the invite is accepted when the user returns.
const PENDING_KEY = 'lullabo.pendingInvite'

function readPending(): string | null {
  try {
    return sessionStorage.getItem(PENDING_KEY)
  } catch {
    return null
  }
}

/** Remembers (or forgets) an invite to accept after Google sign-in. */
export function writePending(code: string | null) {
  try {
    if (code) sessionStorage.setItem(PENDING_KEY, code)
    else sessionStorage.removeItem(PENDING_KEY)
  } catch {
    // Without storage the user taps "join" again after signing in.
  }
}

/** Joined, already a member, or left for Google sign-in (the page reloads on return). */
export type JoinOutcome = 'joined' | 'member' | 'redirected'

/**
 * Joining a family by an invite: signs in with Google first when needed, then accepts it
 * and brings the family's records in. Back from Google sign-in with the invite pending, it
 * accepts it without another tap.
 */
export function useJoinInvite(code: string, preview: InvitePreview) {
  const store = useLocalStore()
  const join = useMutation({
    mutationFn: async (): Promise<JoinOutcome> => {
      if (!(await httpAccountApi.me())) {
        writePending(code)
        await signInWithGoogle(`/join/${code}`)
        return 'redirected'
      }
      writePending(null)
      try {
        await familyApi.acceptInvite(code)
      } catch (error) {
        if (error instanceof HttpError && error.status === 409) return 'member'
        throw error
      }
      // A first sign-in on this device links the account now (the family is already joined);
      // otherwise the next pull sees the new family and fetches its records.
      if (getAccount(store)) await requestSync()
      else await connectIfSignedIn(store)
      return 'joined'
    },
  })

  const { mutate } = join
  const resume = preview.status === 'active' && readPending() === code
  useEffect(() => {
    if (!resume) return
    writePending(null)
    mutate()
  }, [resume, mutate])

  return join
}
