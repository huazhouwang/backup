import { clsx } from 'clsx'
import {
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'

import { Button } from '../../components/ui/Button'
import { FormError } from '../../components/ui/FormError'
import { MicIcon } from '../../components/ui/MicIcon'
import { START_CUE_MS, playCue, tapPhone } from '../../lib/cues'
import { hideHint, isHintHidden } from '../../lib/hints'
import { useNow } from '../../lib/use-now'
import { m } from '../../paraglide/messages.js'
import { MicDeniedSheet, MicExplainSheet } from './MicSheets'
import { MAX_RECORDING_MS, useMicPermission, useRecorder } from './recorder'

/** Slid up this far (px) while holding, letting go drops the recording. */
const CANCEL_DISTANCE = 60
/** Let go sooner than this (ms) and it was a tap: record hands-free until the next tap. */
const TAP_MS = 300
const BARS = 5
/** While talking, what has been said so far is heard this often. */
const PARTIAL_EVERY_MS = 1500

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

type Mode = 'off' | 'hold' | 'free'

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
  const [mode, setMode] = useState<Mode>('off')
  const [dropping, setDropping] = useState(false)
  const [startedAt, setStartedAt] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [permission, setPermission] = useMicPermission()
  const [sheet, setSheet] = useState<'explain' | 'denied' | null>(null)
  const down = useRef<{ y: number; at: number } | null>(null)

  const recorder = useRecorder()
  const done = () => {
    setMode('off')
    setDropping(false)
    const said = recorder.finish()
    tapPhone()
    if (said) {
      playCue('send')
      onSpoken(said)
    } else {
      playCue('cancel')
      setError(m.voiceMicTooShort())
      onDrop()
    }
  }
  // At the longest, what was said so far is sent.
  const recording = mode !== 'off'
  const latestDone = useRef(done)
  useEffect(() => {
    latestDone.current = done
  })
  useEffect(() => {
    if (!recording) return undefined
    const cutoff = setTimeout(() => latestDone.current(), MAX_RECORDING_MS)
    return () => clearTimeout(cutoff)
  }, [recording])
  // What has been said so far, heard every so often; never two at once.
  const latestPartial = useRef(onPartial)
  useEffect(() => {
    latestPartial.current = onPartial
  })
  const { state: recorderState, snapshot } = recorder
  useEffect(() => {
    if (recorderState !== 'recording') return undefined
    let busy = false
    const every = setInterval(() => {
      const soFar = busy ? null : snapshot()
      if (!soFar) return
      busy = true
      void latestPartial.current(soFar).finally(() => {
        busy = false
      })
    }, PARTIAL_EVERY_MS)
    return () => clearInterval(every)
  }, [recorderState, snapshot])
  const drop = () => {
    recorder.cancel()
    playCue('cancel')
    tapPhone()
    setMode('off')
    setDropping(false)
    onDrop()
  }
  const begin = (next: Mode) => {
    setError(null)
    setMode(next)
    setStartedAt(Date.now())
    onBegin()
    // The start sound plays first; the recording leaves it out.
    playCue('start')
    tapPhone()
    recorder.start(START_CUE_MS).catch((reason: unknown) => {
      setMode('off')
      onDrop()
      if (reason instanceof DOMException && reason.name === 'NotAllowedError') {
        setPermission('denied')
        setSheet('denied')
      } else setError(m.actionFailed())
    })
  }
  // Before the microphone is used: explain first when the system is about to ask, or say how
  // to turn it back on when it was refused. True when the press can go ahead.
  const mayRecord = () => {
    if (permission === 'denied') setSheet('denied')
    else if (permission === 'prompt' && !isHintHidden('micPermission')) setSheet('explain')
    else return true
    return false
  }
  const decided = (hide: boolean) => {
    if (hide) hideHint('micPermission')
    setSheet(null)
  }

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled || event.button !== 0) return
    if (mode === 'off' && !mayRecord()) return
    down.current = { y: event.clientY, at: event.timeStamp }
    if (mode !== 'off') return
    event.currentTarget.setPointerCapture(event.pointerId)
    begin('hold')
  }
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (mode === 'hold' && down.current) {
      setDropping(down.current.y - event.clientY > CANCEL_DISTANCE)
    }
  }
  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const pressed = down.current
    down.current = null
    if (!pressed) return
    if (mode === 'free') done()
    else if (mode !== 'hold') return
    else if (dropping) drop()
    else if (event.timeStamp - pressed.at < TAP_MS) setMode('free')
    else done()
  }
  const onPointerCancel = () => {
    down.current = null
    if (mode === 'hold') drop()
  }
  // Keyboards and switch control press without a pointer: each press starts or sends.
  const onClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail !== 0 || disabled) return
    if (mode !== 'off') done()
    else if (mayRecord()) begin('free')
  }

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
                <Levels analyser={recorder.analyser} />
                <Elapsed since={startedAt} />
                <span className="min-w-0 flex-1 truncate text-caption font-bold">{status}</span>
                {mode === 'free' && (
                  <Button variant="ghost" className="-mr-2 min-h-0 px-2 py-1" onClick={drop}>
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
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onClick={onClick}
            onContextMenu={(event) => event.preventDefault()}
          >
            <MicIcon />
          </Button>
        ) : (
          <span key="send">{send}</span>
        )}
      </div>
      {error && <FormError size="caption">{error}</FormError>}
      <MicExplainSheet
        open={sheet === 'explain'}
        // Agreed to: the system asks now, and recording goes on hands-free once it may.
        onContinue={(hide) => {
          decided(hide)
          begin('free')
        }}
        onLater={decided}
      />
      <MicDeniedSheet open={sheet === 'denied'} onClose={() => setSheet(null)} />
    </div>
  )
}
