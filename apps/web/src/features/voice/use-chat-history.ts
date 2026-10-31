import { type InfiniteData, useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'

import { type ChatMessage, type ChatPage } from './api'
import { keepLatestChatPage, voiceKeys, voiceQueries } from './queries'

/** How near the end (px) still counts as at it. */
const END_SLACK = 48

/**
 * The chat's saved messages, oldest first, paged back in time. `list` goes on the list, in
 * its `[data-chat-scroll]` scroller: it opens at its end and follows what is added there,
 * unless scrolled up from it (`follow` brings it back). `top` goes on an element at the top
 * of the list: reaching it loads the page before, keeping what is on screen where it was.
 */
export function useChatHistory(open: boolean) {
  const queryClient = useQueryClient()
  const history = useInfiniteQuery({ ...voiceQueries.chat(), enabled: open })
  // Closed, the chat keeps only its latest page for next time (keepLatestChatPage).
  useEffect(() => () => keepLatestChatPage(queryClient), [queryClient])

  // Pages go back in time; the list reads oldest first.
  const pages = history.data?.pages ?? []
  const messages = pages.toReversed().flatMap((page) => page.lines)
  const threads: ChatPage['threads'] = {}
  for (const page of pages) Object.assign(threads, page.threads)
  const activeThreadId = pages[0]?.activeThreadId ?? null
  const lastThreadId = messages.findLast((message) => message.threadId)?.threadId ?? null
  // The latest conversation is over: the next message starts afresh.
  const ended = lastThreadId !== null && lastThreadId !== activeThreadId

  /** Shows a message before the server has it; returns its id, for `update`. */
  const append = (message: Omit<ChatMessage, 'id' | 'threadId'>) => {
    const id = crypto.randomUUID()
    queryClient.setQueryData<InfiniteData<ChatPage, string | null>>(voiceKeys.chat, (data) => {
      if (!data) return data
      const [latest, ...rest] = data.pages
      if (!latest) return data
      const line = { ...message, id, threadId: null }
      return { ...data, pages: [{ ...latest, lines: [...latest.lines, line] }, ...rest] }
    })
    return id
  }
  /**
   * Changes the text of a message shown by `append`: corrected (with what was `heard` when
   * the correction changed the words), or a reply growing.
   */
  const update = (id: string, text: string, heard?: string) =>
    queryClient.setQueryData<InfiniteData<ChatPage, string | null>>(voiceKeys.chat, (data) => {
      if (!data) return data
      const [latest, ...rest] = data.pages
      if (!latest) return data
      const lines = latest.lines.map((line) => (line.id === id ? { ...line, text, heard } : line))
      return { ...data, pages: [{ ...latest, lines }, ...rest] }
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

  // Following the end: from opening until scrolled up, and again once back at it.
  const pinned = useRef(true)
  useLayoutEffect(() => {
    const content = list.current
    const root = content?.closest('[data-chat-scroll]')
    if (!content || !root) return undefined
    const toEnd = () => {
      root.scrollTop = root.scrollHeight
    }
    toEnd()
    let height = root.scrollHeight
    const scrolled = () => {
      // Moved by the list changing size (a shorter one clamps it), not by the user.
      if (root.scrollHeight !== height) {
        height = root.scrollHeight
        return
      }
      pinned.current = root.scrollHeight - root.clientHeight - root.scrollTop < END_SLACK
    }
    // New messages, a reply growing, the page or the keyboard changing size: still at the end.
    const resized = new ResizeObserver(() => {
      height = root.scrollHeight
      if (pinned.current) toEnd()
    })
    resized.observe(content)
    resized.observe(root)
    root.addEventListener('scroll', scrolled, { passive: true })
    return () => {
      resized.disconnect()
      root.removeEventListener('scroll', scrolled)
    }
  }, [])
  /** Back to the end, following it again: something is being said. */
  const follow = () => {
    pinned.current = true
    const root = list.current?.closest('[data-chat-scroll]')
    if (root) root.scrollTop = root.scrollHeight
  }

  return {
    messages,
    threads,
    ended,
    append,
    update,
    isError: history.isError,
    hasEarlier: hasNextPage,
    loadingEarlier: isFetchingNextPage,
    top,
    list,
    follow,
  }
}
