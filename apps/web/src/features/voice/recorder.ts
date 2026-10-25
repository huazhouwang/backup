import { useCallback, useEffect, useRef, useState } from 'react'

/** Longest recording; the chat sends it then. 30 s of 16 kHz WAV stays under the API's 1 MB. */
export const MAX_RECORDING_MS = 30_000
/** Shorter than this is a slip of the finger, not something said. */
const MIN_RECORDING_MS = 500
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

/** Hands each block of microphone samples to the page, as it comes. */
const TAP = `registerProcessor('bobo-tap', class extends AudioWorkletProcessor {
  process(inputs) {
    const samples = inputs[0] && inputs[0][0]
    if (samples) this.port.postMessage(samples.slice(0))
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

interface Session {
  stream: MediaStream
  context: AudioContext
  /** The microphone's samples so far, at the context's rate. */
  blocks: Float32Array[]
  startedAt: number
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
) {
  // Pulled by the output, silently: nothing is played back.
  const mute = context.createGain()
  mute.gain.value = 0
  mute.connect(context.destination)
  if (context.audioWorklet) {
    const url = URL.createObjectURL(new Blob([TAP], { type: 'text/javascript' }))
    try {
      await context.audioWorklet.addModule(url)
    } finally {
      URL.revokeObjectURL(url)
    }
    const node = new AudioWorkletNode(context, 'bobo-tap')
    node.port.addEventListener('message', (event: MessageEvent<Float32Array>) => {
      take(event.data)
    })
    node.port.start()
    source.connect(node).connect(mute)
    return
  }
  const node = context.createScriptProcessor(4096, 1, 1)
  node.addEventListener('audioprocess', (event) => {
    take(event.inputBuffer.getChannelData(0).slice(0))
  })
  source.connect(node).connect(mute)
}

/**
 * Records from the microphone. `start` asks for it (the first time, the system asks the user);
 * `snapshot` is what has been said so far, as WAV, while recording goes on; `finish` ends it
 * with the whole recording as WAV, or null when it was too short; `cancel` drops it. The
 * microphone is let go as soon as recording ends, so the system's indicator goes too.
 * `analyser` follows the voice's level while recording.
 */
export function useRecorder() {
  const [state, setState] = useState<RecorderState>('idle')
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)
  const session = useRef<Session | null>(null)
  // Set when the recording is dropped while the microphone is still being asked for.
  const abandoned = useRef(false)

  const release = useCallback(() => {
    const current = session.current
    session.current = null
    setState('idle')
    setAnalyser(null)
    if (!current) return null
    for (const track of current.stream.getTracks()) track.stop()
    void current.context.close()
    return current
  }, [])

  /** `quietMs`: how long from now to leave out, while a cue sounds that it shouldn't hear. */
  const start = useCallback(async (quietMs = 0) => {
    if (session.current) return
    const quietUntil = performance.now() + quietMs
    abandoned.current = false
    setState('starting')
    // Made within the tap, as iOS requires, before anything is awaited.
    const context = new AudioContext()
    // Some browsers start it suspended; nothing would come through.
    void context.resume()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      })
      if (abandoned.current) {
        for (const track of stream.getTracks()) track.stop()
        void context.close()
        return
      }
      const source = context.createMediaStreamSource(stream)
      const levels = context.createAnalyser()
      levels.fftSize = 256
      source.connect(levels)
      const blocks: Float32Array[] = []
      await tap(context, source, (samples) => {
        if (performance.now() >= quietUntil) blocks.push(samples)
      })
      session.current = { stream, context, blocks, startedAt: performance.now() }
      setAnalyser(levels)
      setState('recording')
    } catch (error) {
      void context.close()
      setState('idle')
      throw error
    }
  }, [])

  const snapshot = useCallback(() => {
    const current = session.current
    if (!current || current.blocks.length === 0) return null
    return wav(at16k(current.blocks, current.context.sampleRate))
  }, [])

  const finish = useCallback(() => {
    const current = release()
    if (!current) {
      // Let go before the microphone was ready: nothing was said.
      abandoned.current = true
      return null
    }
    if (performance.now() - current.startedAt < MIN_RECORDING_MS) return null
    return wav(at16k(current.blocks, current.context.sampleRate))
  }, [release])

  const cancel = useCallback(() => {
    abandoned.current = true
    release()
  }, [release])

  // Leaving mid-recording lets go of the microphone.
  useEffect(() => cancel, [cancel])

  return { state, analyser, start, snapshot, finish, cancel }
}
