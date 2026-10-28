import { showToast } from '@lullabo/ui/toast'
import type { Transaction } from '@tanstack/db'
import type { QueryClient } from '@tanstack/react-query'

/**
 * A cache of collections of one kind (a family's members, the account's reminders), one
 * per query client and name, created on first use. Names include the signed-in user (the
 * query cache is cleared on sign-out, not replaced), so another account on the same device
 * never sees the previous one's rows.
 */
export function collectionCache<C>() {
  const byClient = new WeakMap<QueryClient, Map<string, C>>()
  return (queryClient: QueryClient, name: string, create: () => C): C => {
    let byName = byClient.get(queryClient)
    if (!byName) {
      byName = new Map()
      byClient.set(queryClient, byName)
    }
    let collection = byName.get(name)
    if (!collection) {
      collection = create()
      byName.set(name, collection)
    }
    return collection
  }
}

/**
 * Optimistic changes show at once; if the server refuses one, TanStack DB rolls it back and
 * this tells the user, since the sheet that made it has usually closed already.
 */
export function toastIfRefused(transaction: Transaction, message: string) {
  transaction.isPersisted.promise.catch(() => showToast(message, { tone: 'error' }))
}
