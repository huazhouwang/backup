import { Bun } from '@lullabo/ui/bun'
import { showToast } from '@lullabo/ui/toast'
import { cn } from '@lullabo/ui/utils'
import { type InfiniteData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { type MouseEvent, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { MicIcon } from '../../../components/icons/MicIcon'
import { playCue } from '../../../lib/cues'
import { m } from '../../../paraglide/messages.js'
import { useAccess } from '../../../sync/use-access'
import { type ChatPage, voiceApi } from '../api'
import { answered, hearSoFar, recentContext } from '../conversation'
import { voiceKeys, voiceQueries } from '../queries'
import { type TalkAim, useTalk } from '../use-talk'
import { Frost } from './Frost'
import { History } from './History'
import { micLook } from './mic-look'
import { MicControls } from './MicControls'
import { Speaking } from './Speaking'
import { TurnList } from './TurnList'
import type { Phase, Turn } from './types'
import { useOverlayGuard } from './use-overlay-guard'

/** Slid this far (px) sideways while holding, the finger is on the button that side. */
const AIM_DISTANCE = 72

const recentLines = (page: InfiniteData<ChatPage, string | null> | undefined) =>
  page?.pages[0]?.lines.slice(-4) ?? []

/**
 * The microphone in the middle of the tab bar: hold it (or tap it) to talk to the AI from any
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
      const recent = recentContext(history())
      const answer = await voiceApi.stream(
        { text, spoken, recent },
        { heard: (said) => change({ said }), text: (reply) => change({ reply }) },
      )
      change({ reply: answer.reply, confirming: answer.confirming })
      answered()
    } catch {
      playCue('error')
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
      const text = await hearSoFar(soFar, lastReply())
      if (text && talking.current) setLive(text)
    },
    // Dropped: back to the conversation so far, or closed when there is none.
    onDrop: () => {
      talking.current = false
      setLive('')
      if (hasTurns.current) setPhase('done')
      else reset()
    },
    onSpoken: (recording, startup) => {
      talking.current = false
      setPhase('hearing')
      const failed = (why: string) => {
        playCue('error')
        setLive('')
        setProblem(why)
        setPhase('done')
      }
      voiceApi
        .transcribe(recording, { recent: lastReply(), startup })
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
    if (talk.error) showToast(talk.error, { icon: <Bun mood="oops" className="size-8" /> })
  }, [talk.error])
  // Open: the page behind stays put, even under a sliding finger, and Escape closes it.
  useOverlayGuard(open, close)

  // Without an account or an AI, the microphone says what is missing and where to set it up.
  const setUp = (event: MouseEvent) => {
    event.preventDefault()
    // The page opened says why at its top; a toast there would cover its title.
    if (!userId) void navigate({ to: '/settings/account', search: { from: 'mic' } })
    else void navigate({ to: '/settings/ai', search: { from: 'mic' } })
  }
  const ready = Boolean(userId) && !noAi
  const hint =
    talk.mode === 'hold'
      ? m.tabMicHint()
      : talk.mode === 'free'
        ? m.tabMicPauseToSend()
        : phase === 'done'
          ? m.tabMicMore()
          : null
  const last = turns.at(-1)
  return (
    <>
      {/* Its own size, not the tab bar's height, so the bulge below is a circle. */}
      <span className="relative -mt-8 flex self-start">
        {/* The tab bar's top edge, bulging over the microphone's top half and meeting it. */}
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-1.5 rounded-full border-2 border-border bg-background [clip-path:inset(0_0_50%_0)]"
        />
        <button
          ref={button}
          type="button"
          data-sheet-still
          aria-label={m.tabMicLabel()}
          className={cn('relative', micLook(false))}
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
            className="fixed inset-0 z-50 flex animate-[fade-in-up_160ms_ease-out_both] flex-col pt-safe-4 pr-safe-4 pl-safe-4 text-foreground"
            // Room below for the hint, the microphone and the buttons beside it.
            style={{ paddingBottom: `calc(100dvh - ${spot.y}px + 7rem)` }}
            onClick={(event) => {
              if (phase === 'done' && event.target === event.currentTarget) close()
            }}
          >
            <Frost />
            {turns.length > 0 ? (
              <History follow={`${turns.length}-${last?.said}-${last?.reply}-${live}-${phase}`}>
                <TurnList
                  turns={turns}
                  phase={phase}
                  live={live}
                  problem={problem}
                  talk={talk}
                  onAnswer={(answer) => void send(answer, false)}
                />
              </History>
            ) : (
              <Speaking phase={phase} live={live} problem={problem} talk={talk} />
            )}
            {hint && (
              <span
                className="absolute inset-x-0 text-center text-caption font-extrabold text-muted-foreground"
                style={{ top: spot.y - 100 }}
              >
                {hint}
              </span>
            )}
            <MicControls
              talk={talk}
              phase={phase}
              spot={spot}
              onChat={leaveForChat}
              onClose={close}
            />
          </div>,
          document.body,
        )}
    </>
  )
}
