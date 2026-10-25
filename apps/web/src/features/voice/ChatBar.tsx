import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useId, useRef, useState } from 'react'

import { ChatIcon } from '../../components/ui/ChatIcon'
import { m } from '../../paraglide/messages.js'
import { useAccess } from '../../sync/use-access'
import { ChatSheet } from './ChatSheet'
import { voiceQueries } from './queries'

/** What the bar suggests saying; a different one each day. */
const EXAMPLES = [
  m.chatBarExampleBottle,
  m.chatBarExampleAsk,
  m.chatBarExampleFix,
  m.chatBarExampleDiaper,
]

/**
 * Talking to the assistant from Today: a bar like a chat input that opens the chat, the same
 * conversation as Siri, with the keyboard up. Dictation is the keyboard's own microphone.
 * Signed-in only, as the assistant records on the server; without an AI to use it leads to
 * where one is set up.
 */
export function ChatBar() {
  const { userId } = useAccess()
  return userId ? <Bar /> : null
}

function Bar() {
  const { data: settings } = useQuery(voiceQueries.settings())
  const navigate = useNavigate()
  const hintId = useId()
  const keyboard = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const noAi = settings !== undefined && settings.ai === null
  const [example] = useState(
    () => EXAMPLES[Math.floor(Date.now() / 86_400_000) % EXAMPLES.length] ?? m.chatBarExampleBottle,
  )

  function start() {
    if (noAi) {
      void navigate({ to: '/settings/ai' })
      return
    }
    // iOS raises the keyboard only for a focus within the tap: this field takes it, and holds
    // it until the chat's own field does.
    keyboard.current?.focus()
    setOpen(true)
  }

  return (
    <>
      <button
        type="button"
        aria-describedby={hintId}
        onClick={start}
        className="press flex min-h-touch w-full items-center gap-3 rounded-xl border-2 border-b-4 border-border bg-surface px-4 py-3 text-left"
      >
        <ChatIcon className="size-8 text-primary" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-extrabold">{m.voiceChatTitle()}</span>
          <span id={hintId} className="truncate text-caption text-fg-muted">
            {noAi ? m.chatBarNoAi() : m.chatBarHint({ example: example() })}
          </span>
        </span>
      </button>
      <input
        ref={keyboard}
        aria-hidden
        tabIndex={-1}
        className="pointer-events-none fixed top-0 left-0 size-px opacity-0"
      />
      <ChatSheet open={open} focusOnOpen onClose={() => setOpen(false)} />
    </>
  )
}
