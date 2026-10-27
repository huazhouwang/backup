import { useCallback, useEffect, useRef, useState } from 'react'

import { audioContext, audioSessionType, setAudioUse, sinceAudioUseChanged } from '../../lib/audio'

/** Longest recording; the chat sends it then. 30 s of 16 kHz WAV stays under the API's 1 MB. */
export const MAX_RECORDING_MS = 30_000
/** Shorter than this is a slip of the finger, not something said. */
const MIN_RECORDING_MS = 500
/** Less sound than this (s) in a longer recording: the microphone wasn't heard at all. */
const MIN_HEARD_S = 0.25
/** What the speech model takes: one channel at 16 kHz. */
const SAMPLE_RATE = 16_000

/** Whether this browser can record from the microphone (else the keyboard's dictation remains). */
export const canRecord = () =>
  typeof window !== 'undefined' &&
  typeof window.AudioContext !== 'undefined' &&
  typeof navigator.mediaDevices?.getUserMedia === 'function'

export type MicPermission = PermissionState | 'unknown'

/**
 * Whether using the microphone will just work (granted), ask first (prompt) or fail
 * (denied), kept up to date; 'unknown' where the browser can't say. Known ahead of a tap,
 * so the tap itself can decide without waiting.
 */
export function useMicPermission(): [MicPermission, (state: MicPermission) => void] {
  const [state, setState] = useState<MicPermission>('unknown')
  useEffect(() => {
    let status: PermissionStatus | null = null
    const update = () => {
      if (status) setState(status.state)
    }
    navigator.permissions
      ?.query({ name: 'microphone' })
      .then((result) => {
        status = result
        update()
        status.addEventListener('change', update)
      })
      .catch(() => undefined)
    return () => status?.removeEventListener('change', update)
  }, [])
  return [state, setState]
}

/**
 * Hands each block of microphone samples to the page, as it comes. Running with nothing coming
 * in (a microphone that sends nothing) it says so now and then, with an empty block.
 */
const TAP = `registerProcessor('lullabo-tap', class extends AudioWorkletProcessor {
  empty = 0
  process(inputs) {
    const samples = inputs[0] && inputs[0][0]
    if (samples) this.port.postMessage(samples.slice(0))
    else if (this.empty++ % 50 === 0) this.port.postMessage(new Float32Array(0))
    return true
  }
})`

/** 16-bit PCM in a WAV container. */
function wav(samples: Float32Array) {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2))
  const text = (at: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(at + i, value.charCodeAt(i))
  }
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, SAMPLE_RATE, true)
  view.setUint32(28, SAMPLE_RATE * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  samples.forEach((sample, i) => {
    const clamped = Math.max(-1, Math.min(1, sample))
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
  })
  return new Blob([view], { type: 'audio/wav' })
}

/** The blocks so far as one 16 kHz track, each output sample the average of those it covers. */
function at16k(blocks: Float32Array[], rate: number) {
  const length = blocks.reduce((sum, block) => sum + block.length, 0)
  const input = new Float32Array(length)
  let offset = 0
  for (const block of blocks) {
    input.set(block, offset)
    offset += block.length
  }
  const ratio = rate / SAMPLE_RATE
  const output = new Float32Array(Math.floor(length / ratio))
  for (let i = 0; i < output.length; i += 1) {
    const from = Math.floor(i * ratio)
    const to = Math.max(from + 1, Math.floor((i + 1) * ratio))
    let sum = 0
    for (let j = from; j < to; j += 1) sum += input[j] ?? 0
    output[i] = sum / (to - from)
  }
  return output
}

export type RecorderState = 'idle' | 'starting' | 'recording'

/** How long recording took to start (ms): from the press, and taking the microphone. */
export interface Startup {
  readyMs: number
  micMs: number
  /** How many times the microphone was taken again before anything came through. */
  retakes: number
}

/** How a recording ended: what was said, or why there is nothing to send. */
export type Recording =
  | { said: Blob; startup: Startup }
  /** Let go too soon. */
  | { said: null; why: 'short' }
  /** Long enough, but no sound came through: the audio wasn't running. */
  | { said: null; why: 'unheard'; unheard: Unheard }

/** Why the microphone was taken again: nothing came through, or the system muted or ended it. */
export type Retake = 'silent' | 'muted' | 'ended'

/** What the audio was doing when a recording heard nothing, for the logs. */
export interface Unheard {
  /** The audio context's state at the end. */
  contextState: string
  /** How long it waited for sound, from the microphone being granted (ms). */
  waitedMs: number
  /** Each time the microphone was taken again, and why. */
  retakes: Retake[]
  /** The microphone at the end, before it was let go. */
  track: { muted: boolean; readyState: string; enabled: boolean } | null
  /** Times the tap ran with nothing coming in (every 50th run counts once). */
  emptyBlocks: number
  /** The phone's audio session (Safari) at the end, if it says. */
  sessionType: string | null
  /** At the press: how long since the audio session last changed (ms), and the page's state. */
  sinceSessionChangeMs: number
  visibility: string
}

/** The audio graph one recording is heard through. */
interface Wiring {
  context: AudioContext
  /** What the microphone feeds, to be let go of afterwards. */
  nodes: AudioNode[]
  levels: AnalyserNode
  /** Runs the context again whenever it stops while recording. */
  keepRunning: () => void
}

interface Session {
  stream: MediaStream
  wiring: Wiring
  /** Granted at this moment (performance.now()): nothing may come through yet. */
  grantedAt: number
  /** Set once the first samples came through: then it really records. */
  startup: Startup | null
  retakes: Retake[]
  emptyBlocks: number
  /** The microphone's samples so far, at the context's rate. */
  blocks: Float32Array[]
  /** At the press, for the logs. */
  sinceSessionChangeMs: number
  visibility: string
}

/** With nothing come through by now, the microphone is taken again. */
const NOTHING_YET_MS = 1_000
/** Times the microphone is taken again in one recording, at most. */
const MAX_RETAKES = 2

const takeMicrophone = () =>
  navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
  })

const stopTracks = (stream: MediaStream) => {
  for (const track of stream.getTracks()) track.stop()
}

/** Hears the microphone through `context`, handing its samples to `take`. */
async function wire(
  context: AudioContext,
  stream: MediaStream,
  take: (samples: Float32Array) => void,
): Promise<Wiring> {
  // Taking the microphone switches the phone's audio over, which can stop the context,
  // and nothing would come through. With the microphone on it may run again without a
  // tap, so it is restarted now and whenever it stops while recording.
  const keepRunning = () => {
    if (context.state !== 'running') void context.resume()
  }
  keepRunning()
  const source = context.createMediaStreamSource(stream)
  const levels = context.createAnalyser()
  levels.fftSize = 256
  source.connect(levels)
  const nodes = await tap(context, source, take)
  nodes.push(levels)
  context.addEventListener('statechange', keepRunning)
  return { context, nodes, levels, keepRunning }
}

/** Lets go of an audio graph; a context of its own (not the shared one) is closed too. */
function unwire({ context, nodes, keepRunning }: Wiring) {
  for (const node of nodes) node.disconnect()
  context.removeEventListener('statechange', keepRunning)
  if (context !== audioContext()) void context.close()
}

/**
 * Takes the microphone's raw samples as they come: on an AudioWorklet where there is one, else
 * on the older script processor. Raw samples, unlike a compressed recording, can be turned
 * into WAV at any moment, to hear what has been said so far.
 */
async function tap(
  context: AudioContext,
  source: MediaStreamAudioSourceNode,
  take: (samples: Float32Array) => void,
): Promise<AudioNode[]> {
  // Pulled by the output, silently: nothing is played back.
  const mute = context.createGain()
  mute.gain.value = 0
  mute.connect(context.destination)
  if (context.audioWorklet) {
    if (!tapped.has(context)) {
      const url = URL.createObjectURL(new Blob([TAP], { type: 'text/javascript' }))
      try {
        await context.audioWorklet.addModule(url)
      } finally {
        URL.revokeObjectURL(url)
      }
      tapped.add(context)
    }
    const node = new AudioWorkletNode(context, 'lullabo-tap')
    node.port.addEventListener('message', (event: MessageEvent<Float32Array>) => {
      take(event.data)
    })
    node.port.start()
    source.connect(node).connect(mute)
    return [source, node, mute]
  }
  const node = context.createScriptProcessor(4096, 1, 1)
  node.addEventListener('audioprocess', (event) => {
    take(event.inputBuffer.getChannelData(0).slice(0))
  })
  source.connect(node).connect(mute)
  return [source, node, mute]
}

/** Contexts the tap's worklet is already loaded in. */
const tapped = new WeakSet<AudioContext>()

/**
 * Records from the microphone. `start` asks for it (the first time, the system asks the user);
 * `snapshot` is what has been said so far, as WAV, while recording goes on; `finish` ends it
 * with the whole recording as WAV, or why there is none; `cancel` drops it. The
 * microphone is let go as soon as recording ends, so the system's indicator goes too.
 * `analyser` follows the voice's level while recording.
 */
export function useRecorder() {
  const [state, setState] = useState<RecorderState>('idle')
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)
  // When the latest recording really started (epoch ms), once the microphone was taken.
  const [startedAt, setStartedAt] = useState(0)
  const session = useRef<Session | null>(null)
  // Set when the recording is dropped while the microphone is still being asked for.
  const abandoned = useRef(false)

  const release = useCallback(() => {
    const current = session.current
    session.current = null
    setState('idle')
    setAnalyser(null)
    if (!current) return null
    unwire(current.wiring)
    stopTracks(current.stream)
    setAudioUse('sounds')
    return current
  }, [])

  /**
   * `quietMs`: how long to leave out once recording starts, while the start cue sounds,
   * which the recording shouldn't hear.
   */
  const start = useCallback(async (quietMs = 0) => {
    if (session.current) return
    const pressedAt = performance.now()
    const sinceSessionChangeMs = Math.round(Math.min(sinceAudioUseChanged(), 3_600_000))
    const visibility = document.visibilityState
    abandoned.current = false
    setState('starting')
    // Asked to run within the press, before anything is awaited; usually an earlier tap
    // already woke it.
    const context = audioContext()
    setAudioUse('recording')
    try {
      const stream = await takeMicrophone()
      const micMs = Math.round(performance.now() - pressedAt)
      if (abandoned.current) {
        stopTracks(stream)
        setAudioUse('sounds')
        return
      }
      const grantedAt = performance.now()
      const blocks: Float32Array[] = []
      let quietUntil = Number.POSITIVE_INFINITY
      // The first samples to come through, not the microphone being granted, start the
      // recording: before them nothing is heard, so nothing may say it listens.
      const take = (samples: Float32Array) => {
        const current = session.current
        if (samples.length === 0) {
          if (current) current.emptyBlocks += 1
          return
        }
        const now = performance.now()
        if (current && !current.startup) {
          current.startup = {
            readyMs: Math.round(now - pressedAt),
            micMs,
            retakes: current.retakes.length,
          }
          quietUntil = now + quietMs
          setStartedAt(Date.now())
          setState('recording')
        }
        if (now >= quietUntil) blocks.push(samples)
      }

      /**
       * Takes the microphone again, on a fresh context: iOS sometimes hands over a microphone
       * that sends nothing, or mutes or ends it while recording, and a context rebuilt on the
       * same one hears nothing either. Granted already, it needs no tap and asks nothing.
       */
      const retake = async (current: Session, why: Retake) => {
        if (session.current !== current || current.retakes.length >= MAX_RETAKES) return
        current.retakes.push(why)
        const rate = current.wiring.context.sampleRate
        unwire(current.wiring)
        stopTracks(current.stream)
        const fresh = await takeMicrophone().catch(() => null)
        if (!fresh) return
        if (session.current !== current) {
          stopTracks(fresh)
          return
        }
        // At the same rate, so what was heard before and after makes one recording.
        const rewired = await wire(new AudioContext({ sampleRate: rate }), fresh, take)
        if (session.current !== current) {
          unwire(rewired)
          stopTracks(fresh)
          return
        }
        current.stream = fresh
        current.wiring = rewired
        setAnalyser(rewired.levels)
        watch(current)
      }
      /** Takes the microphone again if it sends nothing for a while, or the system stops it. */
      const watch = (current: Session) => {
        const { stream: watched } = current
        const [track] = watched.getAudioTracks()
        const stopped = (why: Retake) => () => {
          if (current.stream === watched) void retake(current, why)
        }
        track?.addEventListener('mute', stopped('muted'), { once: true })
        track?.addEventListener('ended', stopped('ended'), { once: true })
        setTimeout(() => {
          if (current.stream === watched && !current.startup) void retake(current, 'silent')
        }, NOTHING_YET_MS)
      }

      const wiring = await wire(context, stream, take)
      const current: Session = {
        stream,
        wiring,
        grantedAt,
        startup: null,
        retakes: [],
        emptyBlocks: 0,
        blocks,
        sinceSessionChangeMs,
        visibility,
      }
      session.current = current
      setAnalyser(wiring.levels)
      watch(current)
    } catch (error) {
      setAudioUse('sounds')
      setState('idle')
      throw error
    }
  }, [])

  const snapshot = useCallback(() => {
    const current = session.current
    if (!current || current.blocks.length === 0) return null
    return wav(at16k(current.blocks, current.wiring.context.sampleRate))
  }, [])

  const finish = useCallback((): Recording => {
    // As they were while recording: letting go stops the microphone and the session.
    const [track] = session.current?.stream.getAudioTracks() ?? []
    const trackState = track
      ? { muted: track.muted, readyState: track.readyState, enabled: track.enabled }
      : null
    const sessionType = audioSessionType()
    const current = release()
    if (!current) {
      // Let go before the microphone was ready: nothing was said.
      abandoned.current = true
      return { said: null, why: 'short' }
    }
    const now = performance.now()
    if (now - current.grantedAt < MIN_RECORDING_MS) return { said: null, why: 'short' }
    const samples = at16k(current.blocks, current.wiring.context.sampleRate)
    if (!current.startup || samples.length < MIN_HEARD_S * SAMPLE_RATE) {
      const unheard: Unheard = {
        contextState: current.wiring.context.state,
        waitedMs: Math.round(now - current.grantedAt),
        retakes: current.retakes,
        track: trackState,
        emptyBlocks: current.emptyBlocks,
        sessionType,
        sinceSessionChangeMs: current.sinceSessionChangeMs,
        visibility: current.visibility,
      }
      return { said: null, why: 'unheard', unheard }
    }
    return { said: wav(samples), startup: current.startup }
  }, [release])

  const cancel = useCallback(() => {
    abandoned.current = true
    release()
  }, [release])

  // Leaving mid-recording lets go of the microphone.
  useEffect(() => cancel, [cancel])

  return { state, analyser, startedAt, start, snapshot, finish, cancel }
}
