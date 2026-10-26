/**
 * Short sounds and a tap of the phone for moments the user may not be looking at the
 * screen, such as talking to the assistant with a baby in their arms. Sounds are made on the
 * spot (no audio files), round and quiet. On iPhone they follow the ring/silent switch
 * unless the settings say to sound through it, or are off; the tap is always on.
 */
import { audioContext, audioUse, soundThroughSilent, untilSettled } from './audio'
import { type Codec, createStoredValue, useStore } from './store'

const CUES = ['start', 'send', 'cancel', 'reply', 'error', 'tick', 'celebrate'] as const
export type Cue = (typeof CUES)[number]

/** Whether cues sound: following the ring/silent switch, through it, or not at all. */
export const CUE_MODES = ['switch', 'always', 'off'] as const
export type CueMode = (typeof CUE_MODES)[number]

const cueModeCodec: Codec<CueMode> = {
  parse: (raw) => CUE_MODES.find((mode) => mode === raw) ?? 'switch',
  // The default isn't stored.
  serialize: (mode) => (mode === 'switch' ? null : mode),
}
/** Per device, like the other display settings. */
const cueMode = createStoredValue<CueMode>('bobo.cues', cueModeCodec, 'switch')

export const useCueMode = () => useStore(cueMode)
export const setCueMode = (mode: CueMode) => cueMode.set(mode)

/** A note in place of a pitch: a short burst of noise, like a party popper going off. */
const POP = 0

/**
 * Each cue's notes: pitch (Hz, or a pop) and length (s), played one after another, and how
 * loud against the others (1 if left out).
 */
const NOTES: Record<Cue, Array<[number, number, number?]>> = {
  start: [
    [660, 0.07],
    [880, 0.09],
  ],
  send: [
    [880, 0.07],
    [660, 0.09],
  ],
  cancel: [[300, 0.12]],
  // An answer has come: a soft rise and a lingering top note.
  reply: [
    [587, 0.08],
    [784, 0.08],
    [1047, 0.16],
  ],
  // Something went wrong: two falling low notes.
  error: [
    [392, 0.1],
    [262, 0.16],
  ],
  // Something ticked off: a short bright ding.
  tick: [
    [1047, 0.05],
    [1319, 0.12],
  ],
  // Everything ticked off: a party popper's pop, then glittering high notes, fading.
  celebrate: [
    [POP, 0.08, 1.6],
    [2093, 0.07, 0.6],
    [3136, 0.07, 0.55],
    [2637, 0.07, 0.5],
    [3520, 0.07, 0.45],
    [2794, 0.07, 0.4],
    [4186, 0.22, 0.35],
  ],
}
const VOLUME = 0.12
/** How long the start cue sounds, so the microphone can leave it out. */
export const START_CUE_MS = 180

/** How long a cue sounds, in ms. */
const cueLength = (cue: Cue) =>
  NOTES[cue].reduce(
    (sum, [, length], i, notes) => sum + length * (i < notes.length - 1 ? 0.85 : 1),
    0,
  ) * 1000

/**
 * Plays a cue as the 提示音 setting says; every cue in the app goes through here.
 *
 * - Off: nothing.
 * - Following the silent switch: only while the session follows it ("ambient"). With the
 *   microphone on, iOS records in a session that sounds through the switch, so a cue then
 *   (the start cue) stays silent and only the phone's tap says it; just after the
 *   microphone is let go (send, cancel) it waits for the session to switch back first.
 * - Through the silent switch: the session plays back for the cue's length.
 */
export function playCue(cue: Cue) {
  const mode = cueMode.get()
  if (mode === 'off') return
  if (mode === 'switch' && audioUse() === 'recording') return
  const wait = mode === 'switch' ? untilSettled() : 0
  if (wait > 0) {
    setTimeout(() => playCue(cue), wait)
    return
  }
  sound(cue, mode)
}

function sound(cue: Cue, mode: CueMode) {
  try {
    // A little longer than the cue, so its tail isn't cut.
    if (mode === 'always') soundThroughSilent(cueLength(cue) + 300)
    const context = audioContext()
    let at = context.currentTime
    for (const [pitch, length, loudness = 1] of NOTES[cue]) {
      const { source, out } = pitch === POP ? pop(context, length) : tone(context, pitch)
      const level = context.createGain()
      // A quick rise, then a fall away: a soft "ding" rather than a beep.
      level.gain.setValueAtTime(0, at)
      level.gain.linearRampToValueAtTime(VOLUME * loudness, at + 0.005)
      level.gain.exponentialRampToValueAtTime(0.0001, at + length)
      out.connect(level).connect(context.destination)
      source.start(at)
      source.stop(at + length)
      at += length * 0.85
    }
  } catch {
    // No sound where audio isn't available; the screen still shows what happened.
  }
}

/** A note's sound: what starts and stops, and what to take it from. */
interface Voice {
  source: AudioScheduledSourceNode
  out: AudioNode
}

/** A soft round tone at `pitch`. */
function tone(context: AudioContext, pitch: number): Voice {
  const source = context.createOscillator()
  source.type = 'triangle'
  source.frequency.value = pitch
  return { source, out: source }
}

/** A pop: a burst of noise, its hiss taken out so it sounds like a paper popper. */
function pop(context: AudioContext, length: number): Voice {
  const samples = Math.ceil(context.sampleRate * length)
  const buffer = context.createBuffer(1, samples, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < samples; i++) data[i] = Math.random() * 2 - 1
  const source = context.createBufferSource()
  source.buffer = buffer
  const body = context.createBiquadFilter()
  body.type = 'bandpass'
  body.frequency.value = 1400
  body.Q.value = 0.8
  return { source, out: source.connect(body) }
}

let haptic: HTMLLabelElement | null = null

/**
 * A light tap of the phone. Safari has no vibration API, but since iOS 18 a switch toggled
 * through its label taps the phone; other browsers vibrate. Within a tap only.
 */
export function tapPhone() {
  if (typeof navigator.vibrate === 'function') {
    navigator.vibrate(10)
    return
  }
  if (!haptic) {
    haptic = document.createElement('label')
    haptic.ariaHidden = 'true'
    haptic.style.display = 'none'
    const toggle = document.createElement('input')
    toggle.type = 'checkbox'
    toggle.setAttribute('switch', '')
    toggle.tabIndex = -1
    haptic.append(toggle)
    document.body.append(haptic)
  }
  haptic.click()
}
