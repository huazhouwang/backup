import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCanGoBack, useNavigate, useRouter } from '@tanstack/react-router'
import { clsx } from 'clsx'
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react'

import { Button } from '../../components/ui/Button'
import { Chevron } from '../../components/ui/Chevron'
import { FormError } from '../../components/ui/FormError'
import { Input } from '../../components/ui/Input'
import { useBounce } from '../../lib/bounce'
import { playCue } from '../../lib/cues'
import { formatDate, formatTime } from '../../lib/i18n'
import { useVisibleArea } from '../../lib/keyboard'
import { lockScroll } from '../../lib/scroll-lock'
import { m } from '../../paraglide/messages.js'
import { requestSync } from '../../sync/runner'
import { type ChatMessage, type ChatTurn, voiceApi } from './api'
import { ChangingText, typingDots as dots } from './ChangingText'
import { voiceKeys } from './queries'
import { type Startup, canRecord } from './recorder'
import { TalkRow } from './TalkRow'
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
 * is really recorded, and Siri remembers it for the next half hour. A page that covers the
 * app, sliding up over it (styles/app.css); the input stays above the keyboard. Shows the
 * latest messages; scrolling up loads earlier ones, back 30 days.
 *
 * A recording is heard first and shows as the user's message as soon as it is, then goes to
 * the assistant like anything typed.
 */
export function ChatPage({
  focus,
  draft = '',
}: {
  /** Opened to say something: the keyboard comes up. */
  focus: boolean
  /** Text the field starts with. */
  draft?: string
}) {
  const page = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLInputElement>(null)
  useVisibleArea(page, true)
  // The app behind stays put, so a swipe here never moves it.
  useEffect(() => lockScroll(), [])
  useEffect(() => {
    if (focus) field.current?.focus()
  }, [focus])

  const router = useRouter()
  const navigate = useNavigate()
  const canGoBack = useCanGoBack()
  const close = () => {
    if (canGoBack) router.history.back()
    else void navigate({ to: '/' })
  }

  const queryClient = useQueryClient()
  const {
    messages,
    threads,
    ended,
    append,
    update,
    isError,
    hasEarlier,
    loadingEarlier,
    top,
    list,
  } = useChatHistory(true)
  useBounce(scroller, { axes: ['y'], content: list })
  const [text, setText] = useState(draft)
  const [confirming, setConfirming] = useState(false)
  const [unheard, setUnheard] = useState(false)
  // The page renders only in the browser, so this can be asked right away.
  const [micShown] = useState(canRecord)
  // A voice message on its way: being said (with what has been heard so far), then heard.
  const [live, setLive] = useState<{ phase: 'talking' | 'hearing'; text: string } | null>(null)
  // Whether the assistant's reply has started to show, growing as it is written.
  const [answering, setAnswering] = useState(false)
  const lastReply = messages.findLast((message) => message.role === 'assistant')?.text

  const send = useMutation<ChatTurn, Error, { text: string; spoken?: boolean }>({
    mutationFn: async ({ text: said, spoken }) => {
      // A refetch already on its way would overwrite the messages shown below.
      await queryClient.cancelQueries({ queryKey: voiceKeys.chat })
      const recent = messages
        .slice(-4)
        .map((message) => `${message.role === 'user' ? 'User' : 'Bobo'}: ${message.text}`)
      const mine = append({ role: 'user', text: said })
      let reply: string | null = null
      const turn = await voiceApi.stream(
        { text: said, spoken, recent },
        {
          // What was heard, corrected: the message changes in place.
          heard: (corrected) => update(mine, corrected),
          text: (sofar) => {
            if (reply) update(reply, sofar)
            else {
              reply = append({ role: 'assistant', text: sofar })
              setAnswering(true)
            }
          },
        },
      )
      if (reply) update(reply, turn.reply)
      else append({ role: 'assistant', text: turn.reply })
      return turn
    },
    onSuccess: (turn) => {
      // Heard as the answer completes, for a parent not looking at the screen.
      playCue('reply')
      setConfirming(turn.confirming)
      // The agent writes on the server; pull now so the records show without waiting.
      void requestSync()
    },
    onError: () => playCue('error'),
    // Back in step with the server: which conversation the messages went to.
    onSettled: () => {
      setAnswering(false)
      return queryClient.invalidateQueries({ queryKey: voiceKeys.chat })
    },
  })
  const say = (said: string, spoken = false) => {
    if (!said || send.isPending) return
    if (!spoken) setText('')
    setUnheard(false)
    send.mutate({ text: said, spoken })
  }
  const hear = useMutation({
    mutationFn: ({ recording, startup }: { recording: Blob; startup: Startup }) =>
      voiceApi.transcribe(recording, { recent: lastReply, startup }),
    onMutate: () => setUnheard(false),
    onSuccess: ({ text: heard }) => {
      setLive(null)
      if (heard) say(heard, true)
      else setUnheard(true)
    },
    onError: () => setLive(null),
  })
  // While talking: what has been said so far, unless the recording has ended meanwhile.
  const talking = useRef(false)
  const voice = {
    onBegin: () => {
      talking.current = true
      setUnheard(false)
      setLive({ phase: 'talking', text: '' })
    },
    onPartial: async (soFar: Blob) => {
      const { text: heard } = await voiceApi
        .transcribe(soFar, { partial: true, recent: lastReply })
        .catch(() => ({ text: null }))
      if (heard && talking.current) setLive({ phase: 'talking', text: heard })
    },
    onDrop: () => {
      talking.current = false
      setLive(null)
    },
    onSpoken: (recording: Blob, startup: Startup) => {
      talking.current = false
      setLive((current) => ({ phase: 'hearing', text: current?.text ?? '' }))
      hear.mutate({ recording, startup })
    },
  }
  const busy = send.isPending || hear.isPending
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
    <div
      ref={page}
      data-own-scroll
      className={clsx(
        'fixed inset-x-0 top-[var(--visible-top,0px)] z-20 mx-auto flex h-[var(--visible,100dvh)] max-w-app flex-col bg-bg',
        '[view-transition-name:chat]',
      )}
    >
      <header className="flex items-center gap-1 border-b-2 border-border pt-safe-2 pr-safe-4 pb-2 pl-safe-2">
        <button
          type="button"
          aria-label={m.voiceChatClose()}
          onClick={close}
          className="flex size-touch items-center justify-center rounded-full active:bg-surface"
        >
          <Chevron direction="down" className="size-6 text-fg-muted" />
        </button>
        <h1 className="m-0 text-title font-extrabold">{m.voiceChatTitle()}</h1>
      </header>
      <div
        ref={scroller}
        data-chat-scroll
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-safe-4 pl-safe-4"
      >
        {/* New messages are read out as they arrive. */}
        <div
          ref={list}
          role="log"
          aria-live="polite"
          aria-label={m.voiceChatTitle()}
          className="flex min-h-full flex-col justify-end gap-2 py-3"
        >
          {hasEarlier ? (
            <div ref={top} className="text-center text-caption text-fg-muted">
              {loadingEarlier ? m.voiceChatLoadingEarlier() : ' '}
            </div>
          ) : (
            messages.length > 0 && (
              <p className="m-0 text-center text-caption text-fg-muted">{m.voiceChatOldest()}</p>
            )
          )}
          {messages.length === 0 && !busy && (
            <p className="m-0 text-fg-muted">
              {isError ? m.voiceLoadFailed() : m.voiceChatEmpty()}
            </p>
          )}
          {rows}
          {live && (
            <Waiting
              mine
              text={live.text}
              label={live.phase === 'talking' ? m.voiceListening() : m.voiceHearing()}
            />
          )}
          {send.isPending && !answering && <Waiting label={m.voiceThinking()} />}
          {/* Remounts when a message is added at the end, keeping it in view. */}
          <div
            key={`${messages.at(-1)?.id}-${messages.at(-1)?.text.length}-${busy}-${live?.text}`}
            ref={(node) => node?.scrollIntoView({ block: 'end' })}
          />
        </div>
      </div>
      <div
        className="flex flex-col gap-2 border-t-2 border-border pt-2 pr-safe-4 pl-safe-4"
        // Clear of the home indicator, which the keyboard covers when it's up.
        style={{
          paddingBottom:
            'calc(0.5rem + max(0px, env(safe-area-inset-bottom) - var(--keyboard, 0px)))',
        }}
      >
        {confirming && !busy && (
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => say(m.voiceYes())}>
              {m.voiceYes()}
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => say(m.voiceNo())}>
              {m.voiceNo()}
            </Button>
          </div>
        )}
        {unheard && <FormError size="caption">{m.voiceUnheard()}</FormError>}
        {(send.isError || hear.isError) && <FormError size="caption">{m.actionFailed()}</FormError>}
        <form onSubmit={submit}>
          <TalkRow
            field={
              <Input
                label={m.voiceChatLabel()}
                labelHidden
                placeholder={m.voiceChatPlaceholder()}
                value={text}
                ref={field}
                maxLength={300}
                onChange={(event) => setText(event.target.value)}
              />
            }
            send={
              <Button type="submit" disabled={busy || !text.trim()}>
                {m.voiceChatSend()}
              </Button>
            }
            showMic={micShown && !text.trim()}
            disabled={busy}
            {...voice}
          />
        </form>
      </div>
    </div>
  )
}

const bubbleClass = (mine: boolean) =>
  clsx(
    'm-0 max-w-[85%] rounded-2xl px-3 py-2 wrap-anywhere',
    mine
      ? 'self-end rounded-br-md bg-primary text-on-accent'
      : 'self-start rounded-bl-md bg-surface',
  )

function Bubble({ message }: { message: ChatMessage }) {
  const mine = message.role === 'user'
  return (
    // Long unbroken text (a link, an id) wraps instead of widening the page.
    <p className={bubbleClass(mine)}>
      <span className="sr-only">
        {mine ? m.voiceChatSpeakerMe() : m.voiceChatSpeakerAssistant()}
      </span>
      <ChangingText text={message.text} />
    </p>
  )
}

/**
 * A message on its way: the user's while they talk and it is heard (with what has been
 * heard so far), the assistant's while it thinks.
 */
function Waiting({
  mine = false,
  text = '',
  label,
}: {
  mine?: boolean
  text?: string
  label: string
}) {
  return (
    <output className={clsx(bubbleClass(mine), 'block')}>
      {text ? (
        <>
          <span className="sr-only">{label}</span>
          <ChangingText text={text} /> {dots}
        </>
      ) : (
        <span className="flex items-center gap-2">
          {dots}
          {mine ? (
            <span className="text-caption font-bold">{label}</span>
          ) : (
            <span className="sr-only">{label}</span>
          )}
        </span>
      )}
    </output>
  )
}
