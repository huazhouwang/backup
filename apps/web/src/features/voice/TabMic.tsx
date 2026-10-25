import { APP_NAME } from '@bobo/shared'
import { type InfiniteData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { clsx } from 'clsx'
import { type MouseEvent, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { Button } from '../../components/ui/Button'
import { MicIcon } from '../../components/ui/MicIcon'
import { showToast } from '../../components/ui/Toast'
import { lockScroll } from '../../lib/scroll-lock'
import { useNow } from '../../lib/use-now'
import { m } from '../../paraglide/messages.js'
import { requestSync } from '../../sync/runner'
import { useAccess } from '../../sync/use-access'
import { type ChatPage, type ChatTurn, voiceApi } from './api'
import { ChangingText, typingDots } from './ChangingText'
import { voiceKeys, voiceQueries } from './queries'
import { useTalk } from './use-talk'

/** The cancel target sits this far (px) above the microphone. */
const CANCEL_DISTANCE = 90

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
        className="absolute inset-0 rounded-full bg-primary/20 transition-transform duration-100"
      />
      <span
        ref={inner}
        aria-hidden
        className="absolute inset-5 rounded-full bg-primary/35 transition-transform duration-100"
      />
    </>
  )
}

const recentLines = (page: InfiniteData<ChatPage, string | null> | undefined) =>
  page?.pages[0]?.lines.slice(-4) ?? []

/**
 * The microphone in the middle of the tab bar: hold it (or tap it) to talk to Bobo from any
 * page. Everything behind blurs, what is heard grows in the middle, and the answer appears
 * there too, so a quick "换尿布了" never leaves the page. The same conversation as the chat
 * page and Siri.
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

  const talk = useTalk({
    disabled: phase === 'hearing' || phase === 'replying',
    cancelDistance: CANCEL_DISTANCE,
    onBegin: () => {
      talking.current = true
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
  // Open: the page behind stays put, and Escape closes it.
  useEffect(() => (open ? lockScroll() : undefined), [open])
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

  return (
    <>
      <button
        type="button"
        data-sheet-still
        aria-label={m.tabMicLabel()}
        className={clsx(
          '-mt-7 flex size-14 touch-none items-center justify-center rounded-full bg-primary text-on-accent select-none [-webkit-touch-callout:none]',
          // The darker edge sits inside the white ring, so nothing peeks out below it.
          'shadow-[inset_0_-5px_0_var(--color-primary-edge),0_0_0_4px_var(--color-bg)] transition-[translate,box-shadow] duration-75',
          'active:translate-y-[3px] active:shadow-[0_0_0_4px_var(--color-bg)]',
        )}
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
            className="fixed inset-0 z-50 flex animate-[fade-in-up_160ms_ease-out_both] flex-col bg-[rgb(19_31_36/0.62)] pt-safe-4 pr-safe-4 pb-safe-4 pl-safe-4 text-white backdrop-blur-md"
            onClick={(event) => {
              if (phase === 'done' && event.target === event.currentTarget) close()
            }}
          >
            {answering && (
              <button
                type="button"
                aria-label={m.tabMicClose()}
                onClick={close}
                className="flex size-11 items-center justify-center self-end rounded-full bg-white/15"
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
              </button>
            )}
            {answering ? (
              <div className="flex flex-1 flex-col justify-center gap-3" aria-live="polite">
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
              </div>
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
                    talk.dropping && 'text-white/45 line-through',
                  )}
                >
                  {said ? <ChangingText text={said} /> : m.tabMicSpeak()}
                </p>
                {typingDots}
              </div>
            )}
            <div className="flex flex-col items-center gap-2.5">
              {talk.mode === 'hold' && (
                <>
                  <span
                    aria-hidden
                    className={clsx(
                      'flex items-center justify-center rounded-full transition-all',
                      talk.dropping
                        ? 'size-19 bg-danger shadow-[0_5px_0_var(--color-danger-edge)]'
                        : 'size-13 border-2 border-dashed border-white/50',
                    )}
                  >
                    <svg viewBox="0 0 24 24" className="size-6">
                      <path
                        d="M6 6l12 12M18 6 6 18"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                  <span
                    className={clsx(
                      'text-caption font-extrabold',
                      talk.dropping ? 'text-danger-soft' : 'text-white/80',
                    )}
                  >
                    {talk.dropping ? m.voiceMicReleaseToCancel() : m.tabMicHint()}
                  </span>
                </>
              )}
              {talk.mode === 'free' && (
                <span className="text-caption font-extrabold text-white/80">
                  {m.tabMicTapToSend()}
                </span>
              )}
              {answering && (
                <span className="text-caption font-extrabold text-white/80">{m.tabMicMore()}</span>
              )}
              {/* One microphone throughout, so a finger holding it is never lost. */}
              <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-7">
                {answering ? (
                  <button
                    type="button"
                    onClick={() => {
                      close()
                      void navigate({ to: '/chat' })
                    }}
                    className="justify-self-end font-extrabold text-primary-soft"
                  >
                    {m.tabMicOpenChat()}
                  </button>
                ) : (
                  <span aria-hidden />
                )}
                <div className="relative flex size-40 items-center justify-center">
                  {talk.recording && !talk.dropping && <Rings analyser={talk.analyser} />}
                  <button
                    type="button"
                    data-sheet-still
                    aria-label={talk.recording ? m.voiceMicSend() : m.voiceMicHold()}
                    disabled={phase === 'hearing' || phase === 'replying'}
                    className={clsx(
                      'relative flex touch-none items-center justify-center rounded-full transition-all select-none disabled:opacity-60',
                      talk.dropping
                        ? 'size-21 bg-fg-muted shadow-[0_5px_0_#555]'
                        : 'bg-primary shadow-[0_5px_0_var(--color-primary-edge)]',
                      !talk.dropping && (answering ? 'size-19' : 'size-24'),
                    )}
                    {...talk.buttonProps}
                  >
                    <MicIcon className={answering ? 'size-9' : 'size-11'} />
                  </button>
                </div>
                <span aria-hidden />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
