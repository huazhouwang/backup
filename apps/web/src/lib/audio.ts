/**
 * One audio context for the app's sounds and the microphone. Browsers (iOS above all) let
 * audio start only within a tap, so this one is woken by taps anywhere on the page, ahead of
 * time, and kept: it is already running when the microphone is pressed.
 */
let shared: AudioContext | null = null

/** Safari's Audio Session API (iOS 16.4+), not yet in TypeScript's DOM types. */
type AudioSessionType = 'ambient' | 'playback' | 'play-and-record'
const session = () =>
  (navigator as Navigator & { audioSession?: { type: AudioSessionType } }).audioSession

/**
 * What the app's audio is for. Sounds mix with other apps' audio, so a running context never
 * pauses someone's music or podcast, and so follow the ring/silent switch. Recording takes the
 * microphone. A cue that should sound through the silent switch plays back for its length,
 * which may pause other apps' audio (only "playback" passes the switch on iOS).
 */
export type AudioUse = 'sounds' | 'recording' | 'cue'
const SESSION_TYPES: Record<AudioUse, AudioSessionType> = {
  sounds: 'ambient',
  recording: 'play-and-record',
  cue: 'playback',
}
let use: AudioUse = 'sounds'
/** When the session last changed (performance.now()): iOS takes a moment to follow. */
let changedAt = Number.NEGATIVE_INFINITY
/** How long iOS takes to switch the session over, about. */
export const SESSION_SETTLE_MS = 250

export function setAudioUse(next: AudioUse) {
  if (next !== use) changedAt = performance.now()
  use = next
  const current = session()
  if (current) current.type = SESSION_TYPES[next]
}

/** What the audio is for right now. */
export const audioUse = () => use

/** How long until a session change just made has taken effect (ms; 0 once it has). */
export const untilSettled = () => Math.max(0, changedAt + SESSION_SETTLE_MS - performance.now())

/** For the next `ms`, sounds play through the silent switch (recording already does). */
export function soundThroughSilent(ms: number) {
  if (use !== 'sounds') return
  setAudioUse('cue')
  setTimeout(() => {
    if (use === 'cue') setAudioUse('sounds')
  }, ms)
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
