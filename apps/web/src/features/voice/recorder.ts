import { useCallback, useEffect, useRef, useState } from 'react'

/** Longest recording; the chat box sends it then. 30 s of 16 kHz WAV stays under the API's 1 MB. */
export const MAX_RECORDING_MS = 30_000
/** Shorter than this is a slip of the finger, not something said. */
const MIN_RECORDING_MS = 500
/** What the speech model takes: one channel at 16 kHz. */
const SAMPLE_RATE = 16_000

/** Whether this browser can record from the microphone (else the keyboard's dictation remains). */
export const canRecord = () =>
  typeof window !== 'undefined' &&
  typeof window.MediaRecorder !== 'undefined' &&
  typeof navigator.mediaDevices?.getUserMedia === 'function'

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

/**
 * The recording as 16 kHz mono WAV. Phones record in different formats (mp4 on iPhone, webm
 * elsewhere); decoding here means the server always gets the same one.
 */
async function toWav(recording: Blob) {
  const decoded = await new OfflineAudioContext(1, 1, SAMPLE_RATE).decodeAudioData(
    await recording.arrayBuffer(),
  )
  const frames = Math.ceil(decoded.duration * SAMPLE_RATE)
  const context = new OfflineAudioContext(1, frames, SAMPLE_RATE)
  const source = context.createBufferSource()
  source.buffer = decoded
  source.connect(context.destination)
  source.start()
  return wav((await context.startRendering()).getChannelData(0))
}

export type RecorderState = 'idle' | 'starting' | 'recording'

interface Session {
  stream: MediaStream
  recorder: MediaRecorder
  context: AudioContext
  chunks: Blob[]
  startedAt: number
  /** Resolves with what was recorded once the recorder has stopped. */
  stopped: Promise<Blob>
}

/**
 * Records from the microphone. `start` asks for it (the first time, the system asks the user);
 * `finish` resolves with the recording as WAV, or null when it was too short; `cancel` drops
 * it. The microphone is let go as soon as recording ends, so the system's indicator goes too.
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
    if (current.recorder.state !== 'inactive') current.recorder.stop()
    for (const track of current.stream.getTracks()) track.stop()
    void current.context.close()
    return current
  }, [])

  const start = useCallback(async () => {
    if (session.current) return
    abandoned.current = false
    setState('starting')
    // Made within the tap, as iOS requires, before anything is awaited.
    const context = new AudioContext()
    // Some browsers start it suspended; the level would then stay flat.
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
      const levels = context.createAnalyser()
      levels.fftSize = 256
      context.createMediaStreamSource(stream).connect(levels)
      const recorder = new MediaRecorder(stream)
      const chunks: Blob[] = []
      recorder.addEventListener('dataavailable', (event) => chunks.push(event.data))
      const stopped = new Promise<Blob>((resolve) => {
        recorder.addEventListener('stop', () =>
          resolve(new Blob(chunks, { type: recorder.mimeType })),
        )
      })
      recorder.start()
      session.current = {
        stream,
        recorder,
        context,
        chunks,
        startedAt: performance.now(),
        stopped,
      }
      setAnalyser(levels)
      setState('recording')
    } catch (error) {
      void context.close()
      setState('idle')
      throw error
    }
  }, [])

  const finish = useCallback(async () => {
    const current = release()
    if (!current) {
      // Let go before the microphone was ready: nothing was said.
      abandoned.current = true
      return null
    }
    if (performance.now() - current.startedAt < MIN_RECORDING_MS) return null
    return toWav(await current.stopped)
  }, [release])

  const cancel = useCallback(() => {
    abandoned.current = true
    release()
  }, [release])

  // Closing the sheet mid-recording lets go of the microphone.
  useEffect(() => cancel, [cancel])

  return { state, analyser, start, finish, cancel }
}
