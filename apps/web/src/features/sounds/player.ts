import { createStore, useStore } from '../../lib/store'
import { ENDING_SECONDS, type SoundId, soundById, soundUrl } from './sounds'

export interface Playing {
  sound: SoundId
  /** When the timer runs out (ms); null plays until stopped. */
  endsAt: number | null
  /** The sleep it was started for: it stops when that sleep ends (SoundKeeper). */
  sleepId: string
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
  if (current.endsAt - Date.now() > ENDING_SECONDS[current.sound] * 1000) return
  if (soundById(current.sound).kind === 'noise') playEnding(current.sound)
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

/** Starts a sound for a sleep; `minutes` null plays until stopped. Call from a tap. */
export function playSound(sound: SoundId, minutes: number | null, sleepId: string) {
  const media = element()
  endAfterPass = false
  media.loop = soundById(sound).kind === 'noise'
  media.src = soundUrl(sound)
  playing.set({
    sound,
    sleepId,
    endsAt: minutes === null ? null : Date.now() + minutes * 60_000,
    paused: false,
    ending: false,
  })
  // Played as media, so the silent switch doesn't mute it (Safari 17+).
  const session: unknown = Reflect.get(navigator, 'audioSession')
  if (typeof session === 'object' && session !== null) Reflect.set(session, 'type', 'playback')
  start(media)
  showOnLockScreen(sound)
  keepForOffline(sound)
  // timeupdate may pause with the screen locked; this checks the timer too.
  window.clearInterval(ticker)
  ticker = window.setInterval(check, 5000)
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
