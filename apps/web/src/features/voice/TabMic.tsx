import { APP_NAME } from '@bobo/shared'
import { type InfiniteData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { clsx } from 'clsx'
import { AnimatePresence, m as motion } from 'motion/react'
import { type MouseEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { Button } from '../../components/ui/Button'
import { ChatIcon } from '../../components/ui/ChatIcon'
import { MicIcon } from '../../components/ui/MicIcon'
import { StopIcon } from '../../components/ui/StopIcon'
import { showToast } from '../../components/ui/Toast'
import { useBounce } from '../../lib/bounce'
import { riseIn } from '../../lib/motion'
import { lockScroll } from '../../lib/scroll-lock'
import { useNow } from '../../lib/use-now'
import { m } from '../../paraglide/messages.js'
import { requestSync } from '../../sync/runner'
import { useAccess } from '../../sync/use-access'
import { type ChatPage, voiceApi } from './api'
import { ChangingText, typingDots } from './ChangingText'
import { voiceKeys, voiceQueries } from './queries'
import { type TalkAim, useTalk } from './use-talk'

/** Slid this far (px) sideways while holding, the finger is on the button that side. */
const AIM_DISTANCE = 72

/** The microphone; held down it looks pressed, like the tab bar's under the finger. */
const micLook = (pressed: boolean) =>
  clsx(
    'flex size-16 touch-none items-center justify-center rounded-full bg-primary text-on-accent select-none [-webkit-touch-callout:none]',
    'transition-[translate,box-shadow] duration-75',
    // The darker edge sits inside the white ring, so nothing peeks out below it.
    pressed
      ? 'translate-y-[3px] shadow-[0_0_0_4px_var(--color-bg)]'
      : 'shadow-[inset_0_-5px_0_var(--color-primary-edge),0_0_0_4px_var(--color-bg)] active:translate-y-[3px] active:shadow-[0_0_0_4px_var(--color-bg)]',
  )

type Phase = 'idle' | 'talking' | 'hearing' | 'replying' | 'done'

/** Seconds since recording began, as "0:07". */
function Elapsed({ since }: { since: number }) {
  const now = useNow(250)
  const seconds = Math.max(0, Math.floor((now - since) / 1000))
  return (
    <span className="tabular-nums">{`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}</span>
  )
}

/** Two rings around the microphone that swell with the voice. */
function Rings({ analyser }: { analyser: AnalyserNode | null }) {
  const outer = useRef<HTMLSpanElement>(null)
  const inner = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!analyser) return undefined
    const samples = new Uint8Array(analyser.fftSize)
    let frame = 0
    const draw = () => {
      analyser.getByteTimeDomainData(samples)
      let peak = 0
      for (const sample of samples) peak = Math.max(peak, Math.abs(sample - 128) / 128)
      const level = Math.min(1, peak * 3)
      if (outer.current) outer.current.style.transform = `scale(${0.85 + level * 0.3})`
      if (inner.current) inner.current.style.transform = `scale(${0.9 + level * 0.2})`
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [analyser])
  return (
    <>
      <span
        ref={outer}
        aria-hidden
        className="absolute inset-0 rounded-full bg-primary/25 transition-transform duration-100"
      />
      <span
        ref={inner}
        aria-hidden
        className="absolute inset-6 rounded-full bg-primary/40 transition-transform duration-100"
      />
    </>
  )
}

/**
 * Frosted glass that is thickest at the microphone and thins out towards the top, so the
 * page above ends in itself (and the status bar) with no edge. A backdrop blur can't vary
 * across an element, so blurs of growing strength are stacked, each over less of the screen.
 * Layers are [blur px, fully on below this %, gone above this %], measured from the bottom.
 */
const FROST = [
  [2, 50, 100],
  [5, 40, 85],
  [10, 25, 70],
  [20, 0, 50],
] as const

function Frost() {
  return (
    <>
      {FROST.map(([blur, from, to]) => (
        <div
          key={blur}
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            backdropFilter: `blur(${blur}px)`,
            WebkitBackdropFilter: `blur(${blur}px)`,
            maskImage: `linear-gradient(to top, black ${from}%, transparent ${to}%)`,
          }}
        />
      ))}
      {/* The page's own colour over it, the same way: nearly solid at the bottom, none on top. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_top,color-mix(in_oklab,var(--color-bg)_97%,transparent),color-mix(in_oklab,var(--color-bg)_92%,transparent)_40%,color-mix(in_oklab,var(--color-bg)_60%,transparent)_62%,color-mix(in_oklab,var(--color-bg)_15%,transparent)_85%,transparent)]"
      />
    </>
  )
}

/** A round button beside the microphone, with what it does under it. */
function SideButton({
  label,
  aimed,
  tone,
  onClick,
  children,
}: {
  label: string
  /** A held finger has slid onto it: letting go does what it says. */
  aimed: boolean
  tone: 'danger' | 'primary'
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-20 flex-col items-center gap-2 text-caption font-extrabold"
    >
      <span
        className={clsx(
          // Smaller than the microphone, and level with its middle.
          'mt-2.5 flex size-11 items-center justify-center rounded-full border-2 transition-[scale,background-color,border-color,color] duration-150',
          aimed
            ? [
                'scale-125 text-on-accent',
                tone === 'danger' && 'border-danger bg-danger',
                // The bubble's dots take the button's colour.
                tone === 'primary' &&
                  'border-primary bg-primary [--color-surface:var(--color-primary)]',
              ]
            : [
                'border-border bg-bg shadow-[0_3px_0_var(--color-border)]',
                tone === 'danger' ? 'text-fg' : 'text-primary',
              ],
        )}
      >
        {children}
      </span>
      <span className={aimed ? 'text-fg' : 'text-fg-muted'}>{label}</span>
    </button>
  )
}

/** A user's message, as in the chat. */
const userBubble =
  'max-w-[85%] self-end rounded-2xl rounded-br-md bg-primary px-4 py-3 text-body font-bold text-on-accent wrap-anywhere'

/** One message said and Bobo's answer to it. */
interface Turn {
  id: number
  said: string
  reply: string
  problem: string | null
  /** A change waits for a yes or no. */
  confirming: boolean
}

/**
 * The conversation since the overlay opened, down by the microphone where the frost is
 * thickest. Long, it scrolls (and bounces), keeping the newest in view whenever `follow`
 * changes.
 */
function History({ follow, children }: { follow: string; children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null)
  useBounce(scroller, { axes: ['y'] })
  return (
    <div
      ref={scroller}
      data-scrolls
      className="-mx-4 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4"
      role="log"
      aria-live="polite"
    >
      <div className="mt-auto flex flex-col gap-3 py-2">
        {children}
        {/* Remounts when something changes at the end, scrolling it into view. */}
        <div key={follow} ref={(node) => node?.scrollIntoView({ block: 'end' })} />
      </div>
    </div>
  )
}

const recentLines = (page: InfiniteData<ChatPage, string | null> | undefined) =>
  page?.pages[0]?.lines.slice(-4) ?? []

/**
 * The microphone in the middle of the tab bar: hold it (or tap it) to talk to Bobo from any
 * page. Everything behind blurs and the microphone stays where it is, with the chat on its
 * left and cancel on its right to slide onto. What is heard grows in the middle, and the
 * answer appears there too, so a quick "换尿布了" never leaves the page. The same
 * conversation as the chat page and Siri.
 */
export function TabMic() {
  const { userId } = useAccess()
  const { data: settings } = useQuery({ ...voiceQueries.settings(), enabled: Boolean(userId) })
  const noAi = settings !== undefined && settings.ai === null
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [phase, setPhase] = useState<Phase>('idle')
  // What was said and answered since the overlay opened, oldest first; talking again adds on.
  const [turns, setTurns] = useState<Turn[]>([])
  // What is being said (or heard) right now, before it becomes a turn.
  const [live, setLive] = useState('')
  // Why the last recording came to nothing.
  const [problem, setProblem] = useState<string | null>(null)
  // Whether there is a conversation to go back to when a recording is dropped.
  const hasTurns = useRef(false)
  useEffect(() => {
    hasTurns.current = turns.length > 0
  })
  // The middle of the tab bar's microphone on screen: the overlay's sits right on top of it.
  const button = useRef<HTMLButtonElement>(null)
  const [spot, setSpot] = useState({ x: 0, y: 0 })
  // While talking: whether what has been said so far still belongs on screen.
  const talking = useRef(false)
  const history = () =>
    recentLines(queryClient.getQueryData<InfiniteData<ChatPage, string | null>>(voiceKeys.chat))

  const send = async (text: string, spoken: boolean) => {
    // Turns are numbered in order; nothing else is sent while one is answered.
    const id = turns.length
    const change = (next: Partial<Turn>) =>
      setTurns((all) => all.map((turn) => (turn.id === id ? { ...turn, ...next } : turn)))
    setLive('')
    setProblem(null)
    setTurns((all) => [...all, { id, said: text, reply: '', problem: null, confirming: false }])
    setPhase('replying')
    try {
      const recent = history().map(
        (line) => `${line.role === 'user' ? 'User' : 'Bobo'}: ${line.text}`,
      )
      const answer = await voiceApi.stream(
        { text, spoken, recent },
        { heard: (said) => change({ said }), text: (reply) => change({ reply }) },
      )
      change({ reply: answer.reply, confirming: answer.confirming })
      // The agent writes on the server; pull now so the records show without waiting.
      void requestSync()
    } catch {
      change({ problem: m.actionFailed() })
    } finally {
      setPhase('done')
      void queryClient.invalidateQueries({ queryKey: voiceKeys.chat })
    }
  }
  const reset = () => {
    setPhase('idle')
    setTurns([])
    setLive('')
    setProblem(null)
  }
  const lastReply = () => history().findLast((line) => line.role === 'assistant')?.text
  const openChat = () => {
    reset()
    void navigate({ to: '/chat' })
  }

  const talk = useTalk({
    disabled: phase === 'hearing' || phase === 'replying',
    // Slid left onto the chat, or right onto cancel.
    aim: (dx): TalkAim => (dx <= -AIM_DISTANCE ? 'chat' : dx >= AIM_DISTANCE ? 'drop' : null),
    // What was said is dropped either way; the chat just opens.
    onAimed: (aim) => {
      if (aim === 'chat') openChat()
    },
    onBegin: () => {
      talking.current = true
      // Measured without the pressed look's nudge down.
      const at = button.current
      const bar = at?.offsetParent?.getBoundingClientRect()
      if (at && bar) {
        setSpot({
          x: bar.left + at.offsetLeft + at.offsetWidth / 2,
          y: bar.top + at.offsetTop + at.offsetHeight / 2,
        })
      }
      setLive('')
      setProblem(null)
      setPhase('talking')
    },
    onPartial: async (soFar) => {
      const { text } = await voiceApi
        .transcribe(soFar, { partial: true, recent: lastReply() })
        .catch(() => ({ text: null }))
      if (text && talking.current) setLive(text)
    },
    // Dropped: back to the conversation so far, or closed when there is none.
    onDrop: () => {
      talking.current = false
      setLive('')
      if (hasTurns.current) setPhase('done')
      else reset()
    },
    onSpoken: (recording) => {
      talking.current = false
      setPhase('hearing')
      const failed = (why: string) => {
        setLive('')
        setProblem(why)
        setPhase('done')
      }
      voiceApi
        .transcribe(recording, { recent: lastReply() })
        .then(({ text }) => (text ? send(text, true) : failed(m.voiceUnheard())))
        .catch(() => failed(m.actionFailed()))
    },
  })

  const open = phase !== 'idle'
  const close = () => {
    if (talk.recording) talk.drop()
    reset()
  }
  const leaveForChat = () => {
    if (talk.recording) talk.drop()
    openChat()
  }
  // Why a recording came to nothing (too short, or not heard), once the overlay has gone.
  useEffect(() => {
    if (talk.error) showToast(talk.error)
  }, [talk.error])
  // Open: the page behind stays put, even under a sliding finger, and Escape closes it.
  useEffect(() => (open ? lockScroll() : undefined), [open])
  useEffect(() => {
    if (!open) return undefined
    const still = (event: TouchEvent) => {
      if (!(event.target instanceof Element && event.target.closest('[data-scrolls]'))) {
        event.preventDefault()
      }
    }
    document.addEventListener('touchmove', still, { passive: false })
    return () => document.removeEventListener('touchmove', still)
  }, [open])
  const latestClose = useRef(close)
  useEffect(() => {
    latestClose.current = close
  })
  useEffect(() => {
    if (!open) return undefined
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') latestClose.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // Without an account or an AI, the microphone says what is missing and where to set it up.
  const setUp = (event: MouseEvent) => {
    event.preventDefault()
    if (!userId) {
      showToast(m.tabMicSignIn())
      void navigate({ to: '/settings/account' })
    } else {
      showToast(m.tabMicNoAi())
      void navigate({ to: '/settings/ai' })
    }
  }
  const ready = Boolean(userId) && !noAi
  // Tapped, the microphone turning into stop says it all.
  const hint = talk.mode === 'hold' ? m.tabMicHint() : phase === 'done' ? m.tabMicMore() : null
  const last = turns.at(-1)
  // Talking or being heard, after a first turn: on its way as the next message.
  const pending = phase === 'talking' || phase === 'hearing'
  return (
    <>
      {/* Its own size, not the tab bar's height, so the bulge below is a circle. */}
      <span className="relative -mt-8 flex self-start">
        {/* The tab bar's top edge, bulging over the microphone's top half and meeting it. */}
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-1.5 rounded-full border-2 border-border bg-bg [clip-path:inset(0_0_50%_0)]"
        />
        <button
          ref={button}
          type="button"
          data-sheet-still
          aria-label={m.tabMicLabel()}
          className={clsx('relative', micLook(false))}
          {...(ready ? talk.buttonProps : { onClick: setUp })}
        >
          <MicIcon className="size-9" />
        </button>
      </span>
      {talk.sheets}
      {open &&
        createPortal(
          // Clicks on the blurred page itself close it, once the answer is there.
          // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
          <div
            className="fixed inset-0 z-50 flex animate-[fade-in-up_160ms_ease-out_both] flex-col pt-safe-4 pr-safe-4 pl-safe-4 text-fg"
            // Room below for the hint, the microphone and the buttons beside it.
            style={{ paddingBottom: `calc(100dvh - ${spot.y}px + 7rem)` }}
            onClick={(event) => {
              if (phase === 'done' && event.target === event.currentTarget) close()
            }}
          >
            <Frost />
            {turns.length > 0 ? (
              <History follow={`${turns.length}-${last?.said}-${last?.reply}-${live}-${phase}`}>
                <AnimatePresence initial={false}>
                  {turns.flatMap((turn) => [
                    <motion.div
                      key={`${turn.id}-said`}
                      layout="position"
                      {...riseIn}
                      className={userBubble}
                    >
                      <span className="sr-only">{m.voiceChatSpeakerMe()}</span>
                      <ChangingText text={turn.said} />
                    </motion.div>,
                    <motion.div
                      key={`${turn.id}-reply`}
                      layout="position"
                      {...riseIn}
                      className="flex max-w-[90%] flex-col gap-2 self-start rounded-2xl rounded-bl-md border-2 border-border bg-bg px-4 py-3"
                    >
                      <span className="text-caption font-extrabold text-primary-text">
                        {APP_NAME}
                      </span>
                      {turn.reply ? (
                        <p className="m-0 wrap-anywhere">
                          <ChangingText text={turn.reply} />
                        </p>
                      ) : turn.problem ? null : (
                        <span className="text-fg-muted">
                          {typingDots}
                          <span className="sr-only">{m.voiceThinking()}</span>
                        </span>
                      )}
                      {turn.problem && (
                        <p className="m-0 font-bold text-danger-text">{turn.problem}</p>
                      )}
                      {turn === last && turn.confirming && phase === 'done' && (
                        <div className="flex gap-2">
                          <Button className="flex-1" onClick={() => void send(m.voiceYes(), false)}>
                            {m.voiceYes()}
                          </Button>
                          <Button
                            variant="outline"
                            className="flex-1"
                            onClick={() => void send(m.voiceNo(), false)}
                          >
                            {m.voiceNo()}
                          </Button>
                        </div>
                      )}
                    </motion.div>,
                  ])}
                  {/* The next message on its way; it stays put as it becomes the turn. */}
                  {pending && (
                    <motion.div
                      key={`${turns.length}-said`}
                      layout="position"
                      {...riseIn}
                      className={clsx(userBubble, talk.aiming && 'line-through opacity-60')}
                    >
                      <span className={live ? 'sr-only' : 'mr-2 text-caption'}>
                        {phase === 'hearing' ? m.voiceHearing() : m.voiceListening()}
                      </span>
                      {live && <ChangingText text={live} />} {typingDots}
                    </motion.div>
                  )}
                </AnimatePresence>
                {problem && !pending && (
                  <p className="m-0 text-center font-bold text-danger-text">{problem}</p>
                )}
              </History>
            ) : (
              <div
                // Down by the microphone, where the frost is thickest.
                className="flex flex-1 flex-col items-center justify-end gap-4 pb-4 text-center"
                aria-live="polite"
              >
                {pending && (
                  <span className="text-caption font-extrabold tracking-wide text-primary-text">
                    {phase === 'hearing' ? (
                      m.voiceHearing()
                    ) : (
                      <>
                        {m.voiceListening()}
                        {' · '}
                        <Elapsed since={talk.startedAt} />
                      </>
                    )}
                  </span>
                )}
                <p
                  className={clsx(
                    'm-0 text-[28px] leading-10 font-extrabold wrap-anywhere',
                    talk.aiming && 'text-fg-muted/60 line-through',
                    problem && !pending && 'text-danger-text',
                  )}
                >
                  {problem && !pending ? (
                    problem
                  ) : live ? (
                    <ChangingText text={live} />
                  ) : (
                    m.tabMicSpeak()
                  )}
                </p>
                {pending && typingDots}
              </div>
            )}
            {hint && (
              <span
                className="absolute inset-x-0 text-center text-caption font-extrabold text-fg-muted"
                style={{ top: spot.y - 100 }}
              >
                {hint}
              </span>
            )}
            {/* Chat, microphone, cancel: the microphone right where the tab bar's is. */}
            <div
              className="absolute flex -translate-x-1/2 items-start gap-12"
              style={{ left: spot.x, top: spot.y - 32 }}
            >
              <SideButton
                label={talk.aiming === 'chat' ? m.tabMicReleaseToChat() : m.tabMicOpenChat()}
                aimed={talk.aiming === 'chat'}
                tone="primary"
                onClick={leaveForChat}
              >
                <ChatIcon className="size-6" />
              </SideButton>
              <span className="relative flex size-16 items-center justify-center">
                {talk.recording && !talk.aiming && (
                  <span aria-hidden className="pointer-events-none absolute -inset-12">
                    <Rings analyser={talk.analyser} />
                  </span>
                )}
                <button
                  type="button"
                  data-sheet-still
                  aria-label={talk.recording ? m.voiceMicSend() : m.voiceMicHold()}
                  disabled={phase === 'hearing' || phase === 'replying'}
                  className={clsx('relative disabled:opacity-60', micLook(talk.mode === 'hold'))}
                  {...talk.buttonProps}
                >
                  {/* Tapped: the next tap stops and sends. */}
                  {talk.mode === 'free' ? (
                    <StopIcon className="size-9" />
                  ) : (
                    <MicIcon className="size-9" />
                  )}
                </button>
              </span>
              <SideButton
                label={
                  talk.aiming === 'drop'
                    ? m.voiceMicReleaseToCancel()
                    : talk.recording
                      ? m.voiceMicCancel()
                      : m.tabMicClose()
                }
                aimed={talk.aiming === 'drop'}
                tone="danger"
                onClick={close}
              >
                <svg aria-hidden viewBox="0 0 24 24" className="size-5">
                  <path
                    d="M6 6l12 12M18 6 6 18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
              </SideButton>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
