import { tipById } from '@lullabo/shared'
import { useBounce } from '@lullabo/ui/bounce'
import { Button } from '@lullabo/ui/button'
import { FormError } from '@lullabo/ui/form-error'
import { Input } from '@lullabo/ui/input'
import { useVisibleArea } from '@lullabo/ui/keyboard'
import { lockScroll } from '@lullabo/ui/scroll-lock'
import { cn } from '@lullabo/ui/utils'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCanGoBack, useNavigate, useRouter } from '@tanstack/react-router'
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react'

import { Chevron } from '../../components/icons/Chevron'
import { playCue } from '../../lib/cues'
import { formatDate, formatTime } from '../../lib/i18n'
import { m } from '../../paraglide/messages.js'
import { type ChatMessage, type ChatTurn, voiceApi } from './api'
import { ChangingText, typingDots as dots } from './ChangingText'
import { ConfirmAnswer } from './ConfirmAnswer'
import { answered, hearSoFar, recentContext } from './conversation'
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
  tip: tipId,
}: {
  /** Opened to say something: the keyboard comes up. */
  focus: boolean
  /** Opened from a tip to ask about it: its id. the AI is told which tip it is. */
  tip?: string
}) {
  const tip = tipId ? tipById(tipId) : undefined
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
    follow,
  } = useChatHistory(true)
  useBounce(scroller, { axes: ['y'], content: list })
  const [text, setText] = useState('')
  // A tip's questions are offered until something is asked.
  const [asked, setAsked] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [unheard, setUnheard] = useState(false)
  // The page renders only in the browser, so this can be asked right away.
  const [micShown] = useState(canRecord)
  // A voice message on its way: being said (with what has been heard so far), then heard.
  const [live, setLive] = useState<{
    phase: 'preparing' | 'talking' | 'hearing'
    text: string
  } | null>(null)
  // Whether the assistant's reply has started to show, growing as it is written.
  const [answering, setAnswering] = useState(false)
  const lastReply = messages.findLast((message) => message.role === 'assistant')?.text

  const send = useMutation<ChatTurn, Error, { text: string; spoken?: boolean }>({
    mutationFn: async ({ text: said, spoken }) => {
      // A refetch already on its way would overwrite the messages shown below.
      await queryClient.cancelQueries({ queryKey: voiceKeys.chat })
      const recent = recentContext(messages)
      const mine = append({ role: 'user', text: said })
      let reply: string | null = null
      const turn = await voiceApi.stream(
        { text: said, spoken, recent, tip: tip?.id },
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
      answered()
      setConfirming(turn.confirming)
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
    follow()
    if (!spoken) setText('')
    setAsked(true)
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
      follow()
      talking.current = true
      setUnheard(false)
      setLive({ phase: 'preparing', text: '' })
    },
    onReady: () => {
      if (talking.current) setLive((current) => ({ phase: 'talking', text: current?.text ?? '' }))
    },
    onPartial: async (soFar: Blob) => {
      const heard = await hearSoFar(soFar, lastReply)
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
    <p key="new" className="m-0 text-center text-caption font-bold text-muted-foreground">
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
          <p
            key={`d-${message.threadId}`}
            className="m-0 text-center text-caption text-muted-foreground"
          >
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
      // Slides up over the page as it opens (lib/page-change.ts).
      data-cover
      className="fixed inset-x-0 top-[var(--visible-top,0px)] z-20 mx-auto flex h-[var(--visible,100dvh)] max-w-app flex-col bg-background"
    >
      <header className="flex items-center gap-1 border-b-2 border-border pt-safe-2 pr-safe-4 pb-2 pl-safe-2">
        <button
          type="button"
          aria-label={m.voiceChatClose()}
          onClick={close}
          className="flex size-touch items-center justify-center rounded-full active:bg-muted"
        >
          <Chevron direction="down" className="size-6 text-muted-foreground" />
        </button>
        <h1 className="m-0 text-title font-extrabold">{m.voiceChatTitle()}</h1>
      </header>
      {/* The list keeps its place itself (use-chat-history.ts), as Safari has no scroll
          anchoring; Chrome's own would move it when the latest page is fetched again. */}
      <div
        ref={scroller}
        data-chat-scroll
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-safe-4 pl-safe-4 [overflow-anchor:none]"
      >
        {/* New messages are read out as they arrive. */}
        <div
          ref={list}
          role="log"
          aria-live="polite"
          aria-label={m.voiceChatTitle()}
          className="flex min-h-full flex-col justify-end gap-2 pt-3 pb-5"
        >
          {hasEarlier ? (
            <div ref={top} className="text-center text-caption text-muted-foreground">
              {loadingEarlier ? m.voiceChatLoadingEarlier() : ' '}
            </div>
          ) : (
            messages.length > 0 && (
              <p className="m-0 text-center text-caption text-muted-foreground">
                {m.voiceChatOldest()}
              </p>
            )
          )}
          {messages.length === 0 && !busy && (
            <p className="m-0 text-muted-foreground">
              {isError
                ? m.voiceLoadFailed()
                : tip
                  ? m.tipAskEmpty({ title: tip.title })
                  : m.voiceChatEmpty()}
            </p>
          )}
          {rows}
          {live && (
            <Waiting
              mine
              text={live.text}
              label={
                live.phase === 'preparing'
                  ? m.voiceMicPreparing()
                  : live.phase === 'talking'
                    ? m.voiceListening()
                    : m.voiceHearing()
              }
            />
          )}
          {send.isPending && !answering && <Waiting label={m.voiceThinking()} />}
        </div>
      </div>
      {/* Clear of the home indicator, which the keyboard covers when it's up. Typing means
          the keyboard is up: on the Home Screen iOS shrinks the whole page for it rather
          than covering it, so --keyboard stays 0 and only the focus tells. */}
      <div className="flex flex-col gap-2 border-t-2 border-border pt-2 pr-safe-4 pb-[calc(0.5rem+max(0px,env(safe-area-inset-bottom)-var(--keyboard,0px)))] pl-safe-4 has-[input:focus]:pb-2">
        {confirming && !busy && <ConfirmAnswer onAnswer={(answer) => say(answer)} />}
        {tip && !asked && !busy && (
          <fieldset className="m-0 flex flex-wrap gap-2 border-0 p-0">
            <legend className="sr-only">{m.tipAskSuggestions()}</legend>
            {[m.tipAskHow(), m.tipAskWorry(), m.tipAskMine()].map((question) => (
              <Button
                key={question}
                variant="soft"
                className="text-left"
                onClick={() => say(m.tipAskQuestion({ title: tip.title, question }))}
              >
                {question}
              </Button>
            ))}
          </fieldset>
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
  cn(
    'm-0 max-w-[85%] rounded-2xl px-3 py-2 wrap-anywhere',
    mine
      ? 'self-end rounded-br-md bg-primary text-primary-foreground'
      : 'self-start rounded-bl-md bg-muted',
  )

function Bubble({ message }: { message: ChatMessage }) {
  const mine = message.role === 'user'
  return (
    // Long unbroken text (a link, an id) wraps instead of widening the page.
    <p className={bubbleClass(mine)}>
      {/* Only your own lines are marked; the rest are the replies. */}
      {mine && <span className="sr-only">{m.voiceChatSpeakerMe()}</span>}
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
    <output className={cn(bubbleClass(mine), 'block')}>
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
