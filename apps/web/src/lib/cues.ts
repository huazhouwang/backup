/**
 * Short sounds and a tap of the phone for moments the user may not be looking at the
 * screen, such as talking to the assistant with a baby in their arms. Sounds are made on the
 * spot (no audio files), round and quiet; on iPhone they follow the ring/silent switch, the
 * tap doesn't.
 */
export type Cue = 'start' | 'send' | 'cancel'

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
}
const VOLUME = 0.12
/** How long the start cue sounds, so the microphone can leave it out. */
export const START_CUE_MS = 180

let context: AudioContext | null = null

/** Plays a cue. Called within a tap, as browsers only let sound start from one. */
export function playCue(cue: Cue) {
  try {
    context ??= new AudioContext()
    void context.resume()
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
