/**
 * One audio context for the app's sounds and the microphone. Browsers (iOS above all) let
 * audio start only within a tap, so this one is woken by taps anywhere on the page, ahead of
 * time, and kept: it is already running when the microphone is pressed.
 */
let shared: AudioContext | null = null

/** Safari's Audio Session API (iOS 16.4+), not yet in TypeScript's DOM types. */
type AudioSessionType = 'ambient' | 'play-and-record'
const session = () =>
  (navigator as Navigator & { audioSession?: { type: AudioSessionType } }).audioSession

/**
 * While nothing records, the app's audio mixes with other apps', so a running context never
 * pauses someone's music or podcast; recording takes the microphone.
 */
export function setAudioUse(use: 'sounds' | 'recording') {
  const current = session()
  if (current) current.type = use === 'recording' ? 'play-and-record' : 'ambient'
}

/** The context, asked to run (it only will within a tap, on iOS). */
export function audioContext(): AudioContext {
  if (!shared) {
    setAudioUse('sounds')
    shared = new AudioContext()
  }
  if (shared.state !== 'running') void shared.resume()
  return shared
}

let waking = false

// Woken on every tap: iOS also suspends it on its own, such as after a phone call.
const wake = () => {
  if (shared?.state !== 'running') audioContext()
}

/** From now on every tap wakes the context, so it runs before the microphone is held. */
export function wakeAudioOnTaps() {
  if (waking) return
  waking = true
  for (const type of ['touchend', 'click', 'keydown']) {
    document.addEventListener(type, wake, { capture: true, passive: true })
  }
}
