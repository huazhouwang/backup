/**
 * Short sounds and a tap of the phone for moments the user may not be looking at the
 * screen, such as talking to the assistant with a baby in their arms. Sounds are made on the
 * spot (no audio files), round and quiet. On iPhone they follow the ring/silent switch
 * unless the settings say to sound through it, or are off; the tap is always on.
 */
import { audioContext, soundThroughSilent } from './audio'
import { type Codec, createStoredValue, useStore } from './store'

export const CUES = ['start', 'send', 'cancel', 'reply', 'error'] as const
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

/** Each cue's notes: pitch (Hz) and length (s), played one after another. */
const NOTES: Record<Cue, Array<[number, number]>> = {
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

/** Plays a cue, as the settings say. Called within a tap, as browsers only let sound start from one. */
export function playCue(cue: Cue) {
  const mode = cueMode.get()
  if (mode === 'off') return
  try {
    // A little longer than the cue, so its tail isn't cut.
    if (mode === 'always') soundThroughSilent(cueLength(cue) + 300)
    const context = audioContext()
    let at = context.currentTime
    for (const [pitch, length] of NOTES[cue]) {
      const tone = context.createOscillator()
      const level = context.createGain()
      tone.type = 'triangle'
      tone.frequency.value = pitch
      // A quick rise, then a fall away: a soft "ding" rather than a beep.
      level.gain.setValueAtTime(0, at)
      level.gain.linearRampToValueAtTime(VOLUME, at + 0.01)
      level.gain.exponentialRampToValueAtTime(0.0001, at + length)
      tone.connect(level).connect(context.destination)
      tone.start(at)
      tone.stop(at + length)
      at += length * 0.85
    }
  } catch {
    // No sound where audio isn't available; the screen still shows what happened.
  }
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
