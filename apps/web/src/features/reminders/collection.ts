import type { Reminder } from '@lullabo/shared'
import { createCollection } from '@tanstack/db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import { useLiveQuery } from '@tanstack/react-db'
import { type QueryClient, useQueryClient } from '@tanstack/react-query'

import { collectionCache } from '../../lib/server-collection'
import { reminderApi } from './notifications'
import { reminderKeys } from './queries'

export const reminderKey = (reminder: Pick<Reminder, 'babyId' | 'kind'>) =>
  `${reminder.babyId}:${reminder.kind}`

async function saveReminders({
  transaction,
}: {
  transaction: { mutations: { modified: Reminder }[] }
}) {
  await Promise.all(transaction.mutations.map(({ modified }) => reminderApi.save(modified)))
}

function createReminders(queryClient: QueryClient, userId: string) {
  return createCollection(
    queryCollectionOptions({
      queryKey: reminderKeys.list(userId),
      queryFn: (): Promise<Reminder[]> => reminderApi.list(),
      queryClient,
      getKey: reminderKey,
      onInsert: saveReminders,
      onUpdate: saveReminders,
    }),
  )
}

const cachedReminders = collectionCache<ReturnType<typeof createReminders>>()

/**
 * The account's reminders, from the server. Turning one on, off or to another interval
 * shows at once and rolls back if the server refuses (TanStack DB optimistic mutations).
 */
export function useRemindersCollection(userId: string) {
  const queryClient = useQueryClient()
  return cachedReminders(queryClient, `${userId}:reminders`, () =>
    createReminders(queryClient, userId),
  )
}

/** The account's reminders, kept up to date. */
export function useReminders(userId: string) {
  const collection = useRemindersCollection(userId)
  const { data } = useLiveQuery((q) => q.from({ reminder: collection }), [collection])
  return { reminders: data ?? [], collection }
}
