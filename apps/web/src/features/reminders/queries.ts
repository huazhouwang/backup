import { queryOptions } from '@tanstack/react-query'

import { getPushState, reminderApi } from './notifications'

export const reminderKeys = {
  /**
   * The reminders query collection is made per user (collection.ts), so its key carries the
   * user id; the rest of the account-side cache is cleared on sign-out.
   */
  list: (userId: string) => ['reminders', userId] as const,
  pushState: ['reminders', 'push-state'] as const,
  vaccines: (userId: string) => ['reminders', userId, 'vaccines'] as const,
  summaries: (userId: string) => ['reminders', userId, 'summaries'] as const,
}

export const reminderQueries = {
  /** Whether this device can and does receive notifications. */
  pushState: () => queryOptions({ queryKey: reminderKeys.pushState, queryFn: getPushState }),
  /** Babies whose vaccination reminders the user turned off (on otherwise). */
  vaccines: (userId: string) =>
    queryOptions({ queryKey: reminderKeys.vaccines(userId), queryFn: reminderApi.vaccines }),
  /** Whether the user gets the daily and the weekly summary (both on unless turned off). */
  summaries: (userId: string) =>
    queryOptions({ queryKey: reminderKeys.summaries(userId), queryFn: reminderApi.summaries }),
}
