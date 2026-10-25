import { APP_NAME } from '@bobo/shared'
import { type InfiniteData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { clsx } from 'clsx'
import { type MouseEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { Button } from '../../components/ui/Button'
import { ChatIcon } from '../../components/ui/ChatIcon'
import { MicIcon } from '../../components/ui/MicIcon'
import { SendIcon } from '../../components/ui/SendIcon'
import { showToast } from '../../components/ui/Toast'
import { useBounce } from '../../lib/bounce'
import { lockScroll } from '../../lib/scroll-lock'
import { THEME_COLORS } from '../../lib/theme'
import { useNow } from '../../lib/use-now'
import { m } from '../../paraglide/messages.js'
import { requestSync } from '../../sync/runner'
import { useAccess } from '../../sync/use-access'
import { type ChatPage, type ChatTurn, voiceApi } from './api'
import { ChangingText, typingDots } from './ChangingText'
import { voiceKeys, voiceQueries } from './queries'
import { type TalkAim, useTalk } from './use-talk'

/** Slid this far (px) sideways while holding, the finger is on the button that side. */
const AIM_DISTANCE = 56

/**
 * The page seen through the overlay (`rgb(19 31 36 / 0.62)` over the page's background),
 * for the status bar above it, which the overlay can't reach.
 */
const SEEN_THROUGH = { light: '#6d7477', dark: THEME_COLORS.dark }

/** The microphone; held down it looks pressed, like the tab bar's under the finger. */
const micLook = (pressed: boolean) =>
  clsx(
    'flex size-14 touch-none items-center justify-center rounded-full bg-primary text-on-accent select-none [-webkit-touch-callout:none]',
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
      className="flex w-24 flex-col items-center gap-2 text-caption font-extrabold"
    >
      <span
        className={clsx(
          'flex size-13 items-center justify-center rounded-full transition-[scale,background-color,color] duration-150',
          aimed
            ? [
                'scale-125 text-on-accent',
                tone === 'danger' && 'bg-danger',
                // The bubble's dots take the button's colour.
                tone === 'primary' && 'bg-primary [--color-surface:var(--color-primary)]',
              ]
            : [
                'bg-bg shadow-[0_4px_0_var(--color-border)]',
                tone === 'danger' ? 'text-fg' : 'text-primary',
              ],
        )}
      >
        {children}
      </span>
      <span className={aimed ? 'text-white' : 'text-white/80'}>{label}</span>
    </button>
  )
}

/** Bobo's answer, scrolling (and bouncing) when it is long. */
function Answer({ children }: { children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null)
  useBounce(scroller, { axes: ['y'] })
  return (
    <div
      ref={scroller}
      data-scrolls
      className="-mx-4 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4"
      aria-live="polite"
    >
      <div className="my-auto flex flex-col gap-3 py-2">{children}</div>
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
  const [said, setSaid] = useState('')
  const [reply, setReply] = useState('')
  const [turn, setTurn] = useState<ChatTurn | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  // The middle of the tab bar's microphone on screen: the overlay's sits right on top of it.
  const button = useRef<HTMLButtonElement>(null)
  const [spot, setSpot] = useState({ x: 0, y: 0 })
  // While talking: whether what has been said so far still belongs on screen.
  const talking = useRef(false)
  const history = () =>
    recentLines(queryClient.getQueryData<InfiniteData<ChatPage, string | null>>(voiceKeys.chat))

  const send = async (text: string, spoken: boolean) => {
    setPhase('replying')
    setSaid(text)
    setReply('')
    setTurn(null)
    try {
      const recent = history().map(
        (line) => `${line.role === 'user' ? 'User' : 'Bobo'}: ${line.text}`,
      )
      const answer = await voiceApi.stream(
        { text, spoken, recent },
        { heard: setSaid, text: setReply },
      )
      setReply(answer.reply)
      setTurn(answer)
      // The agent writes on the server; pull now so the records show without waiting.
      void requestSync()
    } catch {
      setProblem(m.actionFailed())
    } finally {
      setPhase('done')
      void queryClient.invalidateQueries({ queryKey: voiceKeys.chat })
    }
  }
  const lastReply = () => history().findLast((line) => line.role === 'assistant')?.text
  const openChat = () => {
    setPhase('idle')
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
      setSaid('')
      setReply('')
      setTurn(null)
      setProblem(null)
      setPhase('talking')
    },
    onPartial: async (soFar) => {
      const { text } = await voiceApi
        .transcribe(soFar, { partial: true, recent: lastReply() })
        .catch(() => ({ text: null }))
      if (text && talking.current) setSaid(text)
    },
    onDrop: () => {
      talking.current = false
      setPhase('idle')
    },
    onSpoken: (recording) => {
      talking.current = false
      setPhase('hearing')
      voiceApi
        .transcribe(recording, { recent: lastReply() })
        .then(({ text }) => {
          if (text) return send(text, true)
          setProblem(m.voiceUnheard())
          setPhase('done')
          return undefined
        })
        .catch(() => {
          setProblem(m.actionFailed())
          setPhase('done')
        })
    },
  })

  const open = phase !== 'idle'
  const close = () => {
    if (talk.recording) talk.drop()
    setPhase('idle')
  }
  const leaveForChat = () => {
    if (talk.recording) talk.drop()
    openChat()
  }
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
  // The status bar is outside the page: it takes on the blurred page's colour meanwhile.
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]')
    if (!open || !meta) return undefined
    const before = meta.getAttribute('content')
    const dark = document.documentElement.dataset.theme === 'dark'
    meta.setAttribute('content', dark ? SEEN_THROUGH.dark : SEEN_THROUGH.light)
    return () => {
      if (before) meta.setAttribute('content', before)
    }
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
  const answering = phase === 'replying' || phase === 'done'
  const hint =
    talk.mode === 'hold'
      ? m.tabMicHint()
      : talk.mode === 'free'
        ? m.tabMicTapToSend()
        : phase === 'done'
          ? m.tabMicMore()
          : null
  return (
    <>
      <button
        ref={button}
        type="button"
        data-sheet-still
        aria-label={m.tabMicLabel()}
        className={clsx('-mt-7', micLook(false))}
        {...(ready ? talk.buttonProps : { onClick: setUp })}
      >
        <MicIcon className="size-8" />
      </button>
      {talk.sheets}
      {open &&
        createPortal(
          // Clicks on the blurred page itself close it, once the answer is there.
          // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
          <div
            className="fixed inset-0 z-50 flex animate-[fade-in-up_160ms_ease-out_both] flex-col bg-[rgb(19_31_36/0.62)] pt-safe-4 pr-safe-4 pl-safe-4 text-white backdrop-blur-md"
            // Room below for the hint, the microphone and the buttons beside it.
            style={{ paddingBottom: `calc(100dvh - ${spot.y}px + 7rem)` }}
            onClick={(event) => {
              if (phase === 'done' && event.target === event.currentTarget) close()
            }}
          >
            {answering ? (
              <Answer>
                <p className="m-0 max-w-[85%] self-end rounded-2xl rounded-br-md bg-primary px-4 py-3 text-body font-bold wrap-anywhere">
                  <span className="sr-only">{m.voiceChatSpeakerMe()}</span>
                  <ChangingText text={said} />
                </p>
                <div className="flex max-w-[90%] flex-col gap-2 self-start rounded-2xl rounded-bl-md bg-bg px-4 py-3 text-fg">
                  <span className="text-caption font-extrabold text-primary-text">{APP_NAME}</span>
                  {reply ? (
                    <p className="m-0 wrap-anywhere">
                      <ChangingText text={reply} />
                    </p>
                  ) : problem ? null : (
                    <span className="text-fg-muted">
                      {typingDots}
                      <span className="sr-only">{m.voiceThinking()}</span>
                    </span>
                  )}
                  {problem && <p className="m-0 font-bold text-danger-text">{problem}</p>}
                  {turn?.confirming && phase === 'done' && (
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
                </div>
              </Answer>
            ) : (
              <div
                className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
                aria-live="polite"
              >
                <span className="text-caption font-extrabold tracking-wide text-primary-soft">
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
                <p
                  className={clsx(
                    'm-0 text-[28px] leading-10 font-extrabold wrap-anywhere',
                    talk.aiming && 'text-white/45 line-through',
                  )}
                >
                  {said ? <ChangingText text={said} /> : m.tabMicSpeak()}
                </p>
                {typingDots}
              </div>
            )}
            {hint && (
              <span
                className="absolute inset-x-0 text-center text-caption font-extrabold text-white/80"
                style={{ top: spot.y - 92 }}
              >
                {hint}
              </span>
            )}
            {/* Chat, microphone, cancel: the microphone right where the tab bar's is. */}
            <div
              className="absolute flex -translate-x-1/2 items-start gap-5"
              style={{ left: spot.x, top: spot.y - 28 }}
            >
              <SideButton
                label={talk.aiming === 'chat' ? m.tabMicReleaseToChat() : m.tabMicOpenChat()}
                aimed={talk.aiming === 'chat'}
                tone="primary"
                onClick={leaveForChat}
              >
                <ChatIcon className="size-7" />
              </SideButton>
              <span className="relative flex size-14 items-center justify-center">
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
                  {/* Tapped: the next tap sends. */}
                  {talk.mode === 'free' ? (
                    <SendIcon className="size-8" />
                  ) : (
                    <MicIcon className="size-8" />
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
                <svg aria-hidden viewBox="0 0 24 24" className="size-6">
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
