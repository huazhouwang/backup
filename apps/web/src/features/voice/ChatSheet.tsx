import { useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react'

import { Button } from '../../components/ui/Button'
import { FormError } from '../../components/ui/FormError'
import { Input } from '../../components/ui/Input'
import { Sheet } from '../../components/ui/Sheet'
import { formatDate, formatTime } from '../../lib/i18n'
import { m } from '../../paraglide/messages.js'
import { requestSync } from '../../sync/runner'
import { type ChatMessage, type ChatTurn, voiceApi } from './api'
import { voiceKeys } from './queries'
import { useChatHistory } from './use-chat-history'

const dayOf = (time: number) => new Date(time).toDateString()

/** "今天 21:30", "昨天 08:05", "10月3日 14:20": when a conversation started. */
function startedLabel(at: number) {
  const time = formatTime(at)
  if (dayOf(at) === dayOf(Date.now())) return m.voiceChatToday({ time })
  if (dayOf(at) === dayOf(Date.now() - 86_400_000)) return m.voiceChatYesterday({ time })
  return `${formatDate(at)} ${time}`
}

/**
 * Talks to the family's assistant as Siri would, in the same conversation: what is said here
 * is really recorded, and Siri remembers it for the next half hour. Shows the latest
 * messages; scrolling up loads earlier ones, back 30 days.
 */
export function ChatSheet({
  open,
  onClose,
  focusOnOpen = false,
}: {
  open: boolean
  onClose: () => void
  /** Opened to say something: the field takes the focus, and the keyboard comes up. */
  focusOnOpen?: boolean
}) {
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (open && focusOnOpen) field.current?.focus()
  }, [open, focusOnOpen])
  const queryClient = useQueryClient()
  const { messages, threads, ended, append, isError, hasEarlier, loadingEarlier, top, list } =
    useChatHistory(open)
  const [text, setText] = useState('')
  const [confirming, setConfirming] = useState(false)

  const send = useMutation<ChatTurn, Error, string>({
    mutationFn: voiceApi.send,
    onMutate: async (said) => {
      // A refetch already on its way would overwrite the message shown below.
      await queryClient.cancelQueries({ queryKey: voiceKeys.chat })
      append({ role: 'user', text: said })
    },
    onSuccess: (turn) => {
      append({ role: 'assistant', text: turn.reply })
      setConfirming(turn.confirming)
      // The agent writes on the server; pull now so the records show without waiting.
      void requestSync()
    },
    // Back in step with the server: which conversation the messages went to.
    onSettled: () => queryClient.invalidateQueries({ queryKey: voiceKeys.chat }),
  })
  const say = (said: string) => {
    if (!said || send.isPending) return
    setText('')
    send.mutate(said)
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    say(text.trim())
  }

  const newConversation = (
    <p key="new" className="m-0 text-center text-caption font-bold text-fg-muted">
      {m.voiceChatNew()}
    </p>
  )
  const rows = messages.flatMap((message, index) => {
    const previous = messages[index - 1]
    const before: ReactNode[] = []
    if (message.threadId && message.threadId !== previous?.threadId) {
      const started = threads[message.threadId]?.startedAt
      if (started !== undefined) {
        before.push(
          <p key={`d-${message.threadId}`} className="m-0 text-center text-caption text-fg-muted">
            {startedLabel(started)}
          </p>,
        )
      }
    }
    if (ended && !message.threadId && previous?.threadId) before.push(newConversation)
    return [...before, <Bubble key={message.id} message={message} />]
  })
  if (ended && messages.at(-1)?.threadId) rows.push(newConversation)

  return (
    <Sheet open={open} onClose={onClose} title={m.voiceChatTitle()}>
      <div className="flex flex-col gap-3">
        {/* New messages are read out as they arrive. */}
        <div
          ref={list}
          role="log"
          aria-live="polite"
          aria-label={m.voiceChatTitle()}
          className="flex min-h-40 flex-col gap-2"
        >
          {hasEarlier ? (
            <div ref={top} className="text-center text-caption text-fg-muted">
              {loadingEarlier ? m.voiceChatLoadingEarlier() : '\u00a0'}
            </div>
          ) : (
            messages.length > 0 && (
              <p className="m-0 text-center text-caption text-fg-muted">{m.voiceChatOldest()}</p>
            )
          )}
          {messages.length === 0 && !send.isPending && (
            <p className="m-0 text-fg-muted">
              {isError ? m.voiceLoadFailed() : m.voiceChatEmpty()}
            </p>
          )}
          {rows}
          {send.isPending && (
            <output className="m-0 block text-caption text-fg-muted">{m.voiceThinking()}</output>
          )}
        </div>
        {confirming && !send.isPending && (
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => say(m.voiceYes())}>
              {m.voiceYes()}
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => say(m.voiceNo())}>
              {m.voiceNo()}
            </Button>
          </div>
        )}
        <form className="flex items-end gap-2" onSubmit={submit}>
          <div className="min-w-0 flex-1">
            <Input
              label={m.voiceChatLabel()}
              placeholder={m.voiceChatPlaceholder()}
              value={text}
              ref={field}
              maxLength={300}
              onChange={(event) => setText(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={send.isPending || !text.trim()}>
            {m.voiceChatSend()}
          </Button>
        </form>
        {send.isError && <FormError>{m.actionFailed()}</FormError>}
        {/* Remounts when a message is added at the end, keeping it and the input in view. */}
        <div
          key={`${messages.at(-1)?.id}-${send.isPending}`}
          ref={(node) => node?.scrollIntoView({ block: 'end' })}
        />
      </div>
    </Sheet>
  )
}

function Bubble({ message }: { message: ChatMessage }) {
  const mine = message.role === 'user'
  return (
    // Long unbroken text (a link, an id) wraps instead of widening the sheet.
    <p
      className={clsx(
        'm-0 max-w-[85%] rounded-2xl px-3 py-2 wrap-anywhere',
        mine
          ? 'self-end rounded-br-md bg-primary text-on-accent'
          : 'self-start rounded-bl-md bg-surface',
      )}
    >
      <span className="sr-only">
        {mine ? m.voiceChatSpeakerMe() : m.voiceChatSpeakerAssistant()}
      </span>
      {message.text}
    </p>
  )
}
