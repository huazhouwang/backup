import { queryOptions } from '@tanstack/react-query'

import { PERSIST } from '../../lib/query'
import { fetchSignInMethods, fetchSignInOptions, httpAccountApi } from './account'
import { listPasskeys } from './passkey'

// Not keyed by user: signing out clears the whole query cache (AccountSettings).

export const accountKeys = {
  me: ['account', 'me'] as const,
  methods: ['account', 'methods'] as const,
  passkeys: ['account', 'passkeys'] as const,
  signInOptions: ['sign-in-options'] as const,
}

export const accountQueries = {
  me: () =>
    queryOptions({ queryKey: accountKeys.me, queryFn: () => httpAccountApi.me(), meta: PERSIST }),
  methods: () =>
    queryOptions({ queryKey: accountKeys.methods, queryFn: fetchSignInMethods, meta: PERSIST }),
  passkeys: () =>
    queryOptions({ queryKey: accountKeys.passkeys, queryFn: listPasskeys, meta: PERSIST }),
  /** Changes only when the deployment is reconfigured. */
  signInOptions: () =>
    queryOptions({
      queryKey: accountKeys.signInOptions,
      queryFn: fetchSignInOptions,
      staleTime: 60 * 60 * 1000,
    }),
}
