import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'

import { PERSIST } from '../../lib/query'
import { voiceApi } from './api'

// Not keyed by user: signing out clears the whole query cache.

export const voiceKeys = {
  all: ['voice'] as const,
  settings: ['voice', 'settings'] as const,
  chat: ['voice', 'chat'] as const,
}

export const voiceQueries = {
  /** Phrase, code and whose AI commands use. */
  settings: () =>
    queryOptions({ queryKey: voiceKeys.settings, queryFn: voiceApi.settings, meta: PERSIST }),
  /** The last 30 days of conversations, newest page first. */
  chat: () =>
    infiniteQueryOptions({
      queryKey: voiceKeys.chat,
      queryFn: ({ pageParam }) => voiceApi.chat(pageParam),
      initialPageParam: null as string | null,
      getNextPageParam: (page) => page.next,
    }),
}
