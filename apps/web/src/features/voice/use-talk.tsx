import {
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'

import { START_CUE_MS, playCue, tapPhone } from '../../lib/cues'
import { hideHint, isHintHidden } from '../../lib/hints'
import { m } from '../../paraglide/messages.js'
import { MicDeniedSheet, MicExplainSheet } from './MicSheets'
import { MAX_RECORDING_MS, useMicPermission, useRecorder } from './recorder'

/** Let go sooner than this (ms) and it was a tap: record hands-free until the next tap. */
const TAP_MS = 300
/** While talking, what has been said so far is heard this often. */
const PARTIAL_EVERY_MS = 1500

export type TalkMode = 'off' | 'hold' | 'free'

export interface TalkOptions {
  disabled: boolean
  /** Slid up this far (px) while holding, letting go drops the recording. */
  cancelDistance: number
  /** Recording started. */
  onBegin: () => void
  /** What has been said so far, while recording goes on. */
  onPartial: (soFar: Blob) => Promise<void>
  /** Recording ended with nothing to send: dropped, too short or failed. */
  onDrop: () => void
  /** The whole recording, to send. */
  onSpoken: (recording: Blob) => void
}

/**
 * Talking by microphone: hold it to talk and let go to send, slide up to drop it, or tap it
 * to talk hands-free and tap again to send. Before the microphone is first used, the system's
 * question is explained (or how to turn it back on, once refused). While recording, what has
 * been said so far goes to `onPartial` every so often, one at a time. `buttonProps` go on the
 * microphone button, which must stay the same element while held so the finger is never
 * lost; `sheets` go anywhere in the page.
 */
export function useTalk({
  disabled,
  cancelDistance,
  onBegin,
  onPartial,
  onDrop,
  onSpoken,
}: TalkOptions) {
  const [mode, setMode] = useState<TalkMode>('off')
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
  const begin = (next: TalkMode) => {
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
      setDropping(down.current.y - event.clientY > cancelDistance)
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

  const sheets: ReactNode = (
    <>
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
    </>
  )
  return {
    mode,
    recording,
    dropping,
    startedAt,
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
