import {
  type InfiniteData,
  type QueryClient,
  infiniteQueryOptions,
  queryOptions,
} from '@tanstack/react-query'

import { PERSIST } from '../../lib/query'
import { type ChatPage, voiceApi } from './api'

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
  /**
   * The last 30 days of conversations, newest page first. Fetched again whenever the chat
   * opens: Siri may have added to it meanwhile.
   */
  chat: () =>
    infiniteQueryOptions({
      queryKey: voiceKeys.chat,
      queryFn: ({ pageParam }) => voiceApi.chat(pageParam),
      staleTime: 0,
      initialPageParam: null as string | null,
      getNextPageParam: (page) => page.next,
    }),
}

/**
 * The chat closed: only its latest page stays. Opening it again then draws a few messages
 * rather than all those scrolled back through, and fetches one page, the latest, instead of
 * every page again in turn. Earlier pages load again on scrolling up.
 */
export function keepLatestChatPage(client: QueryClient) {
  client.setQueryData<InfiniteData<ChatPage, string | null>>(voiceKeys.chat, (data) =>
    data && data.pages.length > 1
      ? { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) }
      : data,
  )
}
