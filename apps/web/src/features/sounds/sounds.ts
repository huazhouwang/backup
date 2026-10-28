import { m } from '../../paraglide/messages.js'

/**
 * The soothing sounds, rendered by scripts/render-sounds.mjs into public/sounds. A tune plays
 * through and starts again; a noise loops without a seam. Each has an `-end` file that fades
 * out, played when the timer runs out (iOS doesn't let a page turn the volume down).
 */
export const SOUNDS = [
  { id: 'brahms', kind: 'tune', title: m.soundBrahms },
  { id: 'twinkle', kind: 'tune', title: m.soundTwinkle },
  { id: 'white-noise', kind: 'noise', title: m.soundWhiteNoise },
  { id: 'brown-noise', kind: 'noise', title: m.soundBrownNoise },
  { id: 'shush', kind: 'noise', title: m.soundShush },
] as const

export type Sound = (typeof SOUNDS)[number]
export type SoundId = Sound['id']

export const soundById = (id: SoundId): Sound =>
  SOUNDS.find((sound) => sound.id === id) ?? SOUNDS[0]

export const isSoundId = (value: unknown): value is SoundId =>
  SOUNDS.some((sound) => sound.id === value)

export const soundUrl = (id: SoundId, ending = false) => `/sounds/${id}${ending ? '-end' : ''}.m4a`

/** How long the endings last (s): a tune's is one more pass, a noise's a fade. */
export const ENDING_SECONDS: Record<SoundId, number> = {
  brahms: 48.5,
  twinkle: 42,
  'white-noise': 45,
  'brown-noise': 45,
  shush: 45,
}

/** Timer choices, in minutes; null plays until stopped. */
export const TIMER_MINUTES = [15, 30, 60, null] as const
export type TimerMinutes = (typeof TIMER_MINUTES)[number]
export const isTimerMinutes = (value: unknown): value is TimerMinutes =>
  TIMER_MINUTES.some((minutes) => minutes === value)
