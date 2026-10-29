import { createStore, useStore } from '../../lib/store'
import { type SoundId, type TimerMinutes, soundById, soundUrl } from './sounds'

export interface Playing {
  sound: SoundId
  /** The timer chosen, and when it runs out (ms); null plays until stopped. */
  minutes: TimerMinutes
  endsAt: number | null
  /** Paused from the lock screen or by a call, not stopped. */
  paused: boolean
  /** The timer has run out: the ending is fading away. */
  ending: boolean
}

const playing = createStore<Playing | null>(null)

/** What is playing on this device, if anything. */
export const useSoundPlaying = () => useStore(playing)

/** Kept by the service worker for nights without a connection (scripts/generate-sw.mjs). */
const SOUND_CACHE = 'sounds'

// One element for the whole app, so the sound carries on across pages. A media element
// rather than Web Audio: iOS keeps it playing with the screen locked.
let audio: HTMLAudioElement | null = null
// A tune finishes its pass before its ending starts.
let endAfterPass = false
let ticker: number | undefined

const update = (patch: Partial<Playing>) => {
  const current = playing.get()
  if (current) playing.set({ ...current, ...patch })
}

function element() {
  if (audio) return audio
  const created = new Audio()
  created.preload = 'auto'
  created.addEventListener('timeupdate', check)
  created.addEventListener('ended', passEnded)
  // Reaching the end pauses it too; only a real pause shows as paused.
  created.addEventListener('pause', () => {
    if (!created.ended) update({ paused: true })
  })
  created.addEventListener('play', () => update({ paused: false }))
  audio = created
  return created
}

function start(media: HTMLAudioElement) {
  media.play().catch(() => stopSound())
}

/** Near the end of the timer, the ending takes over so the sound fades instead of stopping. */
function check() {
  const current = playing.get()
  if (!current || current.ending || current.endsAt === null || endAfterPass) return
  if (current.endsAt - Date.now() > soundById(current.sound).endSeconds * 1000) return
  if (soundById(current.sound).kind === 'loop') playEnding(current.sound)
  else endAfterPass = true
}

function playEnding(sound: SoundId) {
  const media = element()
  media.loop = false
  media.src = soundUrl(sound, true)
  update({ ending: true })
  start(media)
}

/** A tune came to its end: again, or its ending; an ending: done. */
function passEnded() {
  const current = playing.get()
  if (!current || !audio) return
  if (current.ending) stopSound()
  else if (endAfterPass) playEnding(current.sound)
  else {
    audio.currentTime = 0
    start(audio)
  }
}

const endsAt = (minutes: TimerMinutes) => (minutes === null ? null : Date.now() + minutes * 60_000)

/** The sound itself from its start, not its ending. */
function playMain(sound: SoundId) {
  const media = element()
  endAfterPass = false
  media.loop = soundById(sound).kind === 'loop'
  media.src = soundUrl(sound)
  start(media)
  showOnLockScreen(sound)
  keepForOffline(sound)
}

/**
 * Plays a sound. Already playing, the sound changes and the timer runs on; otherwise
 * `minutes` starts the timer (null plays until stopped). Call from a tap.
 */
export function playSound(sound: SoundId, minutes: TimerMinutes) {
  const current = playing.get()
  const carryOn = current !== null && !current.ending
  playing.set({
    sound,
    minutes: carryOn ? current.minutes : minutes,
    endsAt: carryOn ? current.endsAt : endsAt(minutes),
    paused: false,
    ending: false,
  })
  // Played as media, so the silent switch doesn't mute it (Safari 17+).
  const session: unknown = Reflect.get(navigator, 'audioSession')
  if (typeof session === 'object' && session !== null) Reflect.set(session, 'type', 'playback')
  playMain(sound)
  // timeupdate may pause with the screen locked; this checks the timer too.
  window.clearInterval(ticker)
  ticker = window.setInterval(check, 5000)
}

/** Sets the timer anew from now, without interrupting the sound; a fading one comes back. */
export function setSoundTimer(minutes: TimerMinutes) {
  const current = playing.get()
  if (!current) return
  playing.set({ ...current, minutes, endsAt: endsAt(minutes), ending: false })
  if (current.ending) playMain(current.sound)
  endAfterPass = false
}

export function stopSound() {
  window.clearInterval(ticker)
  endAfterPass = false
  playing.set(null)
  if (audio) {
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
  }
  if ('mediaSession' in navigator) navigator.mediaSession.metadata = null
}

export const pauseSound = () => audio?.pause()
export function resumeSound() {
  if (audio && playing.get()) start(audio)
}

/** The sound's name and play, pause and stop on the lock screen. */
function showOnLockScreen(sound: SoundId) {
  if (!('mediaSession' in navigator)) return
  navigator.mediaSession.metadata = new MediaMetadata({
    title: soundById(sound).title(),
    artist: 'Lullabo',
    artwork: [{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
  })
  navigator.mediaSession.setActionHandler('play', resumeSound)
  navigator.mediaSession.setActionHandler('pause', pauseSound)
  navigator.mediaSession.setActionHandler('stop', stopSound)
}

/** Keeps the sound and its ending on the device, for playing them with no connection. */
function keepForOffline(sound: SoundId) {
  if (!('caches' in window)) return
  const urls = [soundUrl(sound), soundUrl(sound, true)]
  caches
    .open(SOUND_CACHE)
    .then((cache) =>
      Promise.all(
        urls.map(async (url) => {
          if (!(await cache.match(url))) await cache.add(url)
        }),
      ),
    )
    .catch(() => undefined)
}
