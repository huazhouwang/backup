import { cn } from '@lullabo/ui/utils'

import { ChatIcon } from '../../../components/icons/ChatIcon'
import { MicIcon } from '../../../components/icons/MicIcon'
import { StopIcon } from '../../../components/icons/StopIcon'
import { m } from '../../../paraglide/messages.js'
import { micLook } from './mic-look'
import { SideButton } from './SideButton'
import type { Phase, Talk } from './types'
import { Waves } from './Waves'

/** Chat, microphone, cancel: the microphone right where the tab bar's is. */
export function MicControls({
  talk,
  phase,
  spot,
  onChat,
  onClose,
}: {
  talk: Talk
  phase: Phase
  /** The middle of the tab bar's microphone on screen. */
  spot: { x: number; y: number }
  onChat: () => void
  onClose: () => void
}) {
  return (
    <div
      className="absolute flex -translate-x-1/2 items-start gap-12"
      style={{ left: spot.x, top: spot.y - 32 }}
    >
      <SideButton
        label={talk.aiming === 'chat' ? m.tabMicReleaseToChat() : m.tabMicOpenChat()}
        aimed={talk.aiming === 'chat'}
        tone="primary"
        onClick={onChat}
      >
        <ChatIcon className="size-6" />
      </SideButton>
      <span className="relative flex size-16 items-center justify-center">
        {talk.ready && !talk.aiming && <Waves analyser={talk.analyser} />}
        <button
          type="button"
          data-sheet-still
          aria-label={talk.recording ? m.voiceMicSend() : m.voiceMicHold()}
          disabled={phase === 'hearing' || phase === 'replying'}
          className={cn('relative disabled:opacity-60', micLook(talk.mode === 'hold'))}
          {...talk.buttonProps}
        >
          {/* Tapped: the next tap stops and sends. */}
          {talk.mode === 'free' ? (
            <StopIcon className={cn('size-9', !talk.ready && 'animate-breathe')} />
          ) : (
            <MicIcon className={cn('size-9', talk.recording && !talk.ready && 'animate-breathe')} />
          )}
        </button>
        {/* Hands-free, a pause after speaking fills a ring round it; full, it sends. */}
        {talk.mode === 'free' && talk.pause > 0 && (
          <svg
            aria-hidden
            viewBox="0 0 96 96"
            className="pointer-events-none absolute -inset-4 size-24 -rotate-90"
          >
            <circle
              cx="48"
              cy="48"
              r="44"
              fill="none"
              stroke="var(--color-primary)"
              strokeWidth="5"
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray={`${talk.pause * 100} 100`}
              className="transition-[stroke-dasharray] duration-100 ease-linear"
            />
          </svg>
        )}
        {/* Taking the microphone: an arc runs round it until it listens. */}
        {talk.recording && !talk.ready && (
          <svg
            aria-hidden
            viewBox="0 0 96 96"
            className="pointer-events-none absolute -inset-4 size-24 animate-spin [animation-duration:1.2s] motion-reduce:animate-none"
          >
            <circle
              cx="48"
              cy="48"
              r="44"
              fill="none"
              stroke="var(--color-primary)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray="70 300"
            />
          </svg>
        )}
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
        tone="destructive"
        onClick={onClose}
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
  )
}
