import { type FetchQueryOptions, QueryClient } from '@tanstack/react-query'

import { isSignedIn } from '../db'
import { HttpError } from './api'

/**
 * Server state that isn't part of local-first sync (members, invites, reminders, passkeys).
 * Records themselves live in TanStack DB; this client only caches account-side lists.
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Client errors (401, 403, 404) won't change on retry; network and 5xx might.
        retry: (failures, error) =>
          failures < 2 && !(error instanceof HttpError && error.status < 500),
      },
      mutations: { retry: false },
    },
  })
}

/** Query meta for data kept on the device across reloads and offline (persist-queries.ts). */
export const PERSIST = { persist: true }

/**
 * For a route loader: starts loading these for a signed-in user, not awaited, so the page
 * opens at once and finds the data on its way. Says whether the user is signed in.
 */
export async function prefetchWhenSignedIn(
  client: QueryClient,
  // oxlint-disable-next-line typescript/no-explicit-any -- any query's options
  ...queries: FetchQueryOptions<any, any, any, any>[]
): Promise<boolean> {
  if (!(await isSignedIn())) return false
  for (const query of queries) void client.prefetchQuery(query)
  return true
}
