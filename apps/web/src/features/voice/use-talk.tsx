import {
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'

import { wakeAudioOnTaps } from '../../lib/audio'
import { START_CUE_MS, currentCueMode, playCue, tapPhone } from '../../lib/cues'
import { hideHint, isHintHidden } from '../../lib/hints'
import { m } from '../../paraglide/messages.js'
import { voiceApi } from './api'
import { MicDeniedSheet, MicExplainSheet } from './MicSheets'
import { MAX_RECORDING_MS, type Startup, useMicPermission, useRecorder } from './recorder'

/** Let go sooner than this (ms) and it was a tap: record hands-free until the next tap. */
const TAP_MS = 300
/** While talking, what has been said so far is heard this often. */
const PARTIAL_EVERY_MS = 1500

export type TalkMode = 'off' | 'hold' | 'free'

/**
 * The microphone was explained (and the system asked) since the app was opened: once is
 * enough until it is closed, as the system asks at most once per run too.
 */
let explainedThisRun = false
/**
 * Where a held finger has slid to: letting go there drops the recording, or drops it and
 * leaves for the chat page.
 */
export type TalkAim = 'drop' | 'chat' | null

export interface TalkOptions {
  disabled: boolean
  /** Where a finger held down at the microphone and slid by (dx, dy) px is aiming. */
  aim: (dx: number, dy: number) => TalkAim
  /** Let go while aiming somewhere: the recording is dropped first. */
  onAimed?: (aim: NonNullable<TalkAim>) => void
  /** Recording started: the microphone is being taken. */
  onBegin: () => void
  /** The microphone is heard: from now on what is said is recorded. */
  onReady?: () => void
  /** What has been said so far, while recording goes on. */
  onPartial: (soFar: Blob) => Promise<void>
  /** Recording ended with nothing to send: dropped, too short or failed. */
  onDrop: () => void
  /** The whole recording, to send, and how long it took to start. */
  onSpoken: (recording: Blob, startup: Startup) => void
}

/**
 * Talking by microphone: hold it to talk and let go to send, slide away to drop it, or tap it
 * to talk hands-free and tap again to send. Before the microphone is first used, the system's
 * question is explained (or how to turn it back on, once refused). While recording, what has
 * been said so far goes to `onPartial` every so often, one at a time. `buttonProps` go on the
 * microphone button, which must stay the same element while held so the finger is never
 * lost; `sheets` go anywhere in the page.
 */
export function useTalk({
  disabled,
  aim,
  onAimed,
  onBegin,
  onReady,
  onPartial,
  onDrop,
  onSpoken,
}: TalkOptions) {
  const [mode, setMode] = useState<TalkMode>('off')
  const [aiming, setAiming] = useState<TalkAim>(null)
  const [error, setError] = useState<string | null>(null)
  const [permission, setPermission] = useMicPermission()
  const [sheet, setSheet] = useState<'explain' | 'denied' | null>(null)
  const down = useRef<{ x: number; y: number; at: number } | null>(null)

  const recorder = useRecorder()
  // The audio is woken by taps ahead of time, so it runs from the start of a recording.
  useEffect(() => wakeAudioOnTaps(), [])
  const done = () => {
    setMode('off')
    setAiming(null)
    const recording = recorder.finish()
    tapPhone()
    if (recording.said) {
      playCue('send')
      onSpoken(recording.said, recording.startup)
    } else {
      playCue('cancel')
      setError(recording.why === 'unheard' ? m.voiceMicUnheard() : m.voiceMicTooShort())
      // What the audio was doing, so the logs can say why nothing came through.
      if (recording.why === 'unheard') {
        const report = { ...recording.unheard, cueMode: currentCueMode() }
        void voiceApi.reportUnheard(report).catch(() => {})
      }
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
  const latestReady = useRef(onReady)
  useEffect(() => {
    latestReady.current = onReady
  })
  const { state: recorderState, snapshot } = recorder
  // Only once it really records does it say so: the start sound (which the recording leaves
  // out) and a tap. Taking the microphone can take a moment after the press.
  useEffect(() => {
    if (recorderState !== 'recording') return
    // It records, so the microphone may be used: no need to explain it again this run.
    explainedThisRun = true
    playCue('start')
    tapPhone()
    latestReady.current?.()
  }, [recorderState])
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
    setAiming(null)
    onDrop()
  }
  const begin = (next: TalkMode) => {
    setError(null)
    setMode(next)
    onBegin()
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
    else if (permission === 'prompt' && !explainedThisRun && !isHintHidden('micPermission')) {
      setSheet('explain')
    } else return true
    return false
  }
  const decided = (hide: boolean) => {
    if (hide) hideHint('micPermission')
    setSheet(null)
  }

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled || event.button !== 0) return
    if (mode === 'off' && !mayRecord()) return
    down.current = { x: event.clientX, y: event.clientY, at: event.timeStamp }
    if (mode !== 'off') return
    event.currentTarget.setPointerCapture(event.pointerId)
    begin('hold')
  }
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (mode === 'hold' && down.current) {
      setAiming(aim(event.clientX - down.current.x, event.clientY - down.current.y))
    }
  }
  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const pressed = down.current
    down.current = null
    if (!pressed) return
    if (mode === 'free') done()
    else if (mode !== 'hold') return
    else if (aiming) {
      drop()
      onAimed?.(aiming)
    } else if (event.timeStamp - pressed.at < TAP_MS) setMode('free')
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

  const sheets: ReactNode = (
    <>
      <MicExplainSheet
        open={sheet === 'explain'}
        // Agreed to: the system asks now, and recording goes on hands-free once it may.
        onContinue={(hide) => {
          explainedThisRun = true
          decided(hide)
          begin('free')
        }}
        onLater={decided}
      />
      <MicDeniedSheet open={sheet === 'denied'} onClose={() => setSheet(null)} />
    </>
  )
  return {
    mode,
    recording,
    /** Recording for real; before, the microphone is still being taken. */
    ready: recorderState === 'recording',
    aiming,
    dropping: aiming === 'drop',
    /** When it really started listening (epoch ms). */
    startedAt: recorder.startedAt,
    analyser: recorder.analyser,
    error,
    drop,
    sheets,
    buttonProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onClick,
      onContextMenu: (event: MouseEvent<HTMLButtonElement>) => event.preventDefault(),
    },
  }
}
