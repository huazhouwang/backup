/** A pause this long (ms) after speaking ends a hands-free recording. */
export const PAUSE_MS = 1500
/** Nothing said in this long (ms): it gives up rather than listen on. */
export const NOTHING_SAID_MS = 8000
/** Louder than the room for this long (ms) in all: someone has started speaking. */
const SPEECH_MS = 250
/** The room's level is taken over the first moments (ms), before anyone speaks. */
const ROOM_MS = 400
/** Speech stands this far above the room, and above this level at the least. */
const ABOVE_ROOM = 2.5
const MIN_SPEECH_LEVEL = 0.02

export interface Hearing {
  /** Someone has spoken. */
  spoken: boolean
  /** How far the pause after speaking has gone, from 0 to 1: at 1, send. */
  pause: number
  /** Listening is over: a pause after speaking, or nothing said at all. */
  over: boolean
}

/**
 * Tells when a hands-free speaker has finished, from the microphone's level (0 to 1, as
 * root mean square) heard every so often: speech is what stands well above the room's own
 * level, measured at the start; after some, a pause of PAUSE_MS ends it.
 */
export function listenForPause() {
  let startedAt: number | null = null
  let room = Infinity
  let speech = 0
  let last: number | null = null
  let quietSince: number | null = null
  return (level: number, now: number): Hearing => {
    startedAt ??= now
    const step = last === null ? 0 : now - last
    last = now
    if (now - startedAt < ROOM_MS) {
      room = Math.min(room, level)
      return { spoken: false, pause: 0, over: false }
    }
    const loud = level > Math.max(room * ABOVE_ROOM, MIN_SPEECH_LEVEL)
    if (speech < SPEECH_MS) {
      if (loud) speech += step
      const over = speech < SPEECH_MS && now - startedAt >= NOTHING_SAID_MS
      return { spoken: speech >= SPEECH_MS, pause: 0, over }
    }
    if (loud) quietSince = null
    else quietSince ??= now
    const pause = quietSince === null ? 0 : Math.min(1, (now - quietSince) / PAUSE_MS)
    return { spoken: true, pause, over: pause >= 1 }
  }
}

/** The level of a stretch of samples as the analyser gives them (bytes around 128). */
export function levelOf(samples: Uint8Array) {
  let sum = 0
  for (const sample of samples) {
    const value = (sample - 128) / 128
    sum += value * value
  }
  return Math.sqrt(sum / samples.length)
}

/** A recording's level is read in frames this long (s). */
const FRAME_S = 0.02
/** Room kept around the speech (s): the soft start of a word, and the fall of the last. */
const KEEP_BEFORE_S = 0.3
const KEEP_AFTER_S = 0.5

/**
 * A recording without the room before and after the speech in it: what Whisper makes up
 * words over ("智智智…", a line from its prompt) is mostly that silence and noise at the
 * ends. Speech stands well above the room's level (its quietest frames), as for the pause.
 * With nothing that loud, the recording stays whole for the server to judge.
 */
export function trimSilence(samples: Float32Array, rate: number) {
  const frame = Math.max(1, Math.round(FRAME_S * rate))
  const levels: number[] = []
  for (let start = 0; start < samples.length; start += frame) {
    let sum = 0
    const end = Math.min(samples.length, start + frame)
    for (let i = start; i < end; i += 1) sum += (samples[i] ?? 0) ** 2
    levels.push(Math.sqrt(sum / (end - start)))
  }
  const room = levels.toSorted((a, b) => a - b)[Math.floor(levels.length / 5)] ?? 0
  const speech = Math.max(room * ABOVE_ROOM, MIN_SPEECH_LEVEL)
  const first = levels.findIndex((level) => level >= speech)
  const last = levels.findLastIndex((level) => level >= speech)
  if (first < 0) return samples
  const from = Math.max(0, first * frame - Math.round(KEEP_BEFORE_S * rate))
  const to = Math.min(samples.length, (last + 1) * frame + Math.round(KEEP_AFTER_S * rate))
  return samples.subarray(from, to)
}
