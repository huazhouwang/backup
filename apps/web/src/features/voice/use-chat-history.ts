import { type InfiniteData, useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useLayoutEffect, useRef } from 'react'

import { type ChatMessage, type ChatPage } from './api'
import { voiceKeys, voiceQueries } from './queries'

/**
 * The chat's saved messages, oldest first, paged back in time. `top` goes on an element at
 * the top of the list: reaching it loads the page before, keeping what is on screen where
 * it was. `list` goes on the list itself.
 */
export function useChatHistory(open: boolean) {
  const queryClient = useQueryClient()
  const history = useInfiniteQuery({ ...voiceQueries.chat(), enabled: open })

  // Pages go back in time; the list reads oldest first.
  const pages = history.data?.pages ?? []
  const messages = pages.toReversed().flatMap((page) => page.lines)
  const threads: ChatPage['threads'] = {}
  for (const page of pages) Object.assign(threads, page.threads)
  const activeThreadId = pages[0]?.activeThreadId ?? null
  const lastThreadId = messages.findLast((message) => message.threadId)?.threadId ?? null
  // The latest conversation is over: the next message starts afresh.
  const ended = lastThreadId !== null && lastThreadId !== activeThreadId

  /** Shows a message before the server has it, at the end of the latest page. */
  const append = (message: Omit<ChatMessage, 'id' | 'threadId'>) =>
    queryClient.setQueryData<InfiniteData<ChatPage, string | null>>(voiceKeys.chat, (data) => {
      if (!data) return data
      const [latest, ...rest] = data.pages
      if (!latest) return data
      const line = { ...message, id: crypto.randomUUID(), threadId: null }
      return { ...data, pages: [{ ...latest, lines: [...latest.lines, line] }, ...rest] }
    })

  const anchor = useRef<{ height: number; top: number } | null>(null)
  const list = useRef<HTMLDivElement>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = history
  const top = useCallback(
    (node: HTMLDivElement | null) => {
      const root = node?.closest('[data-chat-scroll]')
      if (!node || !root) return undefined
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry?.isIntersecting || !hasNextPage || isFetchingNextPage) return
          anchor.current = { height: root.scrollHeight, top: root.scrollTop }
          void fetchNextPage()
        },
        { root },
      )
      observer.observe(node)
      return () => observer.disconnect()
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  )
  // Runs when a page is added: that is when the anchor applies.
  useLayoutEffect(() => {
    const root = list.current?.closest('[data-chat-scroll]')
    if (!anchor.current || !root) return
    root.scrollTop = anchor.current.top + root.scrollHeight - anchor.current.height
    anchor.current = null
    // Keyed on the page count on purpose: the anchor applies once the new page is drawn.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [pages.length])

  return {
    messages,
    threads,
    ended,
    append,
    isError: history.isError,
    hasEarlier: hasNextPage,
    loadingEarlier: isFetchingNextPage,
    top,
    list,
  }
}
