import { type ChatPage, idTime } from '@lullabo/shared'
import type { ModelMessage } from '@tanstack/ai'

import { KEEP_MS } from '../agent/retention'
import { withoutThinking } from '../agent/text'
import { SESSION_IDLE_MS, threadPrefix, threadRange } from '../agent/threads'

const messageText = (message: ModelMessage) =>
  withoutThinking(
    typeof message.content === 'string'
      ? message.content
      : (message.content ?? []).map((part) => (part.type === 'text' ? part.content : '')).join(''),
  )

/** Messages on the chat box's first page, and on each earlier one. */
const FIRST_PAGE = 10
const MORE_PAGE = 20
/** Conversations read at a time while filling a page. */
const THREAD_BATCH = 5

interface ChatLine {
  /** `${threadId}~${index}`: stable, and where an earlier page ends. */
  id: string
  threadId: string
  role: 'user' | 'assistant'
  text: string
}

/** What a conversation shows: what the user said and the answers, not tool calls. */
function visibleLines(threadId: string, messagesJson: string): ChatLine[] {
  let messages: ModelMessage[]
  try {
    messages = JSON.parse(messagesJson)
  } catch {
    return []
  }
  const lines: ChatLine[] = []
  for (const message of messages) {
    if (message.role !== 'user' && message.role !== 'assistant') continue
    const text = messageText(message).trim()
    if (text) lines.push({ id: `${threadId}~${lines.length}`, threadId, role: message.role, text })
  }
  return lines
}

/**
 * A page of the user's conversations with Siri and the chat box over the last 30 days: the
 * latest messages, or those just before `before` (a page's `next`). Each conversation comes
 * with when it started, and the one the next message continues is named.
 */
export async function transcript(
  db: D1Database,
  userId: string,
  now: number,
  before?: string,
): Promise<ChatPage> {
  const prefix = threadPrefix(userId)
  const range = threadRange(userId)
  const [cursorThread = '', cursorIndex = ''] = before?.split('~') ?? []
  const fromCursor = cursorThread.startsWith(prefix) ? cursorThread : null
  const end = Number.parseInt(cursorIndex, 10)
  let wanted = fromCursor ? MORE_PAGE : FIRST_PAGE
  const lines: ChatLine[] = []
  let next: string | null = null
  // Older conversations a batch at a time, until the page is full.
  let upTo = fromCursor
  let inclusive = true
  while (wanted > 0) {
    // One batch after another: each starts where the last ended, and most pages need one.
    // oxlint-disable-next-line no-await-in-loop
    const { results } = await db
      .prepare(
        `select thread_id as threadId, messages_json as json from chat_threads
         where thread_id >= ?1 and thread_id < ?6 and updated_at >= ?2
           and (?3 is null or thread_id < ?3 or (?4 and thread_id = ?3))
         order by thread_id desc limit ?5`,
      )
      .bind(range.from, now - KEEP_MS, upTo, inclusive ? 1 : 0, THREAD_BATCH, range.to)
      .all<{ threadId: string; json: string }>()
    for (const row of results) {
      const all = visibleLines(row.threadId, row.json)
      const until = row.threadId === fromCursor && end >= 0 ? Math.min(end, all.length) : all.length
      const start = Math.max(0, until - wanted)
      lines.unshift(...all.slice(start, until))
      wanted -= until - start
      if (wanted === 0) {
        next = `${row.threadId}~${start}`
        break
      }
    }
    if (wanted === 0 || results.length < THREAD_BATCH) break
    upTo = results.at(-1)?.threadId ?? null
    inclusive = false
  }
  const threads = Object.fromEntries(
    [...new Set(lines.map((line) => line.threadId))].map((id) => [
      id,
      { startedAt: idTime(id.slice(prefix.length)) },
    ]),
  )
  const row = await db
    .prepare(
      'select thread_id as threadId, thread_active_at as activeAt from voice_settings where user_id = ?',
    )
    .bind(userId)
    .first<{ threadId: string | null; activeAt: number | null }>()
  const activeThreadId =
    row?.threadId && row.activeAt !== null && now - row.activeAt <= SESSION_IDLE_MS
      ? row.threadId
      : null
  return { lines, threads, next, activeThreadId }
}
