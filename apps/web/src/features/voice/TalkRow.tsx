import { clsx } from 'clsx'
import { type ReactNode, useEffect, useRef } from 'react'

import { Button } from '../../components/ui/Button'
import { FormError } from '../../components/ui/FormError'
import { MicIcon } from '../../components/ui/MicIcon'
import { useNow } from '../../lib/use-now'
import { m } from '../../paraglide/messages.js'
import { useTalk } from './use-talk'

/** Slid up this far (px) while holding, letting go drops the recording. */
const CANCEL_DISTANCE = 60
const BARS = 5

/** How loud the voice is, as bars that follow it. */
function Levels({ analyser }: { analyser: AnalyserNode | null }) {
  const bars = useRef<(HTMLSpanElement | null)[]>([])
  useEffect(() => {
    if (!analyser) return undefined
    const samples = new Uint8Array(analyser.fftSize)
    let frame = 0
    const draw = () => {
      analyser.getByteTimeDomainData(samples)
      let peak = 0
      for (const sample of samples) peak = Math.max(peak, Math.abs(sample - 128) / 128)
      bars.current.forEach((bar, i) => {
        // The middle bars reach highest, so it reads as a voice, not a meter.
        const reach = 1 - Math.abs(i - (BARS - 1) / 2) / BARS
        if (bar) bar.style.transform = `scaleY(${Math.max(0.2, Math.min(1, peak * 3 * reach))})`
      })
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [analyser])
  return (
    <span aria-hidden className="flex h-6 items-center gap-1">
      {Array.from({ length: BARS }, (_, i) => (
        <span
          key={i}
          ref={(node) => {
            bars.current[i] = node
          }}
          className="h-full w-1.5 origin-center rounded-full bg-current transition-transform duration-75"
          style={{ transform: 'scaleY(0.2)' }}
        />
      ))}
    </span>
  )
}

/** Seconds since recording began, as "0:07". */
function Elapsed({ since }: { since: number }) {
  const now = useNow(250)
  const seconds = Math.max(0, Math.floor((now - since) / 1000))
  return (
    <span className="tabular-nums">{`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}</span>
  )
}

/**
 * The chat's input row with a microphone: hold it to talk and let go to send, slide up to
 * drop it, or tap it to talk hands-free and tap again to send. While recording, the field
 * gives way to the voice's level and time, and what has been said so far goes to
 * `onPartial` every so often, one at a time. The button stays the same element throughout,
 * so the finger holding it is never lost.
 */
export function TalkRow({
  field,
  send,
  showMic,
  disabled,
  onBegin,
  onPartial,
  onDrop,
  onSpoken,
}: {
  /** The text field, shown when not recording. */
  field: ReactNode
  /** The send button, shown instead of the microphone once something is typed. */
  send: ReactNode
  showMic: boolean
  disabled: boolean
  /** Recording started. */
  onBegin: () => void
  /** What has been said so far, while recording goes on. */
  onPartial: (soFar: Blob) => Promise<void>
  /** Recording ended with nothing to send: dropped, too short or failed. */
  onDrop: () => void
  /** The whole recording, to send. */
  onSpoken: (recording: Blob) => void
}) {
  const talk = useTalk({
    disabled,
    // Slid up: letting go drops the recording.
    aim: (_dx, dy) => (dy < -CANCEL_DISTANCE ? 'drop' : null),
    onBegin,
    onPartial,
    onDrop,
    onSpoken,
  })
  const { mode, recording, dropping, startedAt, error } = talk
  const status = dropping
    ? m.voiceMicReleaseToCancel()
    : mode === 'hold'
      ? m.voiceMicReleaseToSend()
      : m.voiceMicTapToSend()

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          {recording ? (
            <div className="flex flex-col">
              <span className="sr-only">{m.voiceMicRecording()}</span>
              <output
                className={clsx(
                  'flex min-h-touch items-center gap-3 rounded-lg border-2 px-3',
                  dropping
                    ? 'border-danger bg-danger-soft text-danger-text'
                    : 'border-primary bg-primary-soft text-primary-text',
                )}
              >
                <Levels analyser={talk.analyser} />
                <Elapsed since={startedAt} />
                <span className="min-w-0 flex-1 truncate text-caption font-bold">{status}</span>
                {mode === 'free' && (
                  <Button variant="ghost" className="-mr-2 min-h-0 px-2 py-1" onClick={talk.drop}>
                    {m.voiceMicCancel()}
                  </Button>
                )}
              </output>
            </div>
          ) : (
            field
          )}
        </div>
        {showMic || recording ? (
          <Button
            key="mic"
            data-sheet-still
            tone={dropping ? 'danger' : 'primary'}
            aria-label={recording ? m.voiceMicSend() : m.voiceMicHold()}
            aria-pressed={recording}
            disabled={disabled && !recording}
            className="touch-none px-3 select-none [-webkit-touch-callout:none]"
            {...talk.buttonProps}
          >
            <MicIcon />
          </Button>
        ) : (
          <span key="send">{send}</span>
        )}
      </div>
      {error && <FormError size="caption">{error}</FormError>}
      {talk.sheets}
    </div>
  )
}
