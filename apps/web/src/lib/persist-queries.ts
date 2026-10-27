import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import type { QueryClient } from '@tanstack/react-query'
import { persistQueryClient } from '@tanstack/react-query-persist-client'

const DAY = 86_400_000

const KEY = 'lullabo-queries'

/**
 * Keeps the signed-in user's server data (settings pages) in `storage`, so it shows offline
 * and right after a reload, then refreshes. Only queries marked `meta: { persist: true }` are
 * kept. The cache belongs to one user and one build: another account or a new release
 * starts empty, and signing out deletes it. Returns the function that stops saving, and when
 * the saved data has been restored.
 */
export function persistQueriesTo(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
  queryClient: QueryClient,
  userId: string | undefined,
  build: string = import.meta.env.APP_BUILD,
): [stop: () => void, restored: Promise<void>] {
  const persister = createAsyncStoragePersister({ storage, key: KEY, throttleTime: 0 })
  if (!userId) return [() => undefined, Promise.resolve(persister.removeClient())]
  return persistQueryClient({
    queryClient,
    persister,
    maxAge: 30 * DAY,
    buster: `${build}:${userId}`,
    dehydrateOptions: {
      shouldDehydrateQuery: (query) =>
        query.meta?.persist === true && query.state.status === 'success',
    },
  })
}

/** `persistQueriesTo` the browser's localStorage; nothing during prerendering. */
export function persistQueries(queryClient: QueryClient, userId: string | undefined) {
  if (typeof window === 'undefined') return () => undefined
  const [stop] = persistQueriesTo(window.localStorage, queryClient, userId)
  return stop
}
