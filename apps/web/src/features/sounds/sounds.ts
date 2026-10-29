import { m } from '../../paraglide/messages.js'

/**
 * The soothing sounds, rendered by scripts/sounds/render.mjs into public/sounds. A tune plays
 * through and starts again; a loop (nature, noise) repeats without a seam. Each has an `-end`
 * file that fades out, played when the timer runs out (iOS doesn't let a page turn the volume
 * down).
 */
export const SOUND_GROUPS = [
  {
    title: m.soundGroupTunes,
    sounds: [
      { id: 'brahms', kind: 'tune', title: m.soundBrahms, endSeconds: 48.5 },
      { id: 'twinkle', kind: 'tune', title: m.soundTwinkle, endSeconds: 44 },
      { id: 'jasmine', kind: 'tune', title: m.soundJasmine, endSeconds: 50.7 },
      { id: 'tigers', kind: 'tune', title: m.soundTigers, endSeconds: 57.3 },
      { id: 'sleepy', kind: 'tune', title: m.soundSleepy, endSeconds: 44 },
      { id: 'moon', kind: 'tune', title: m.soundMoon, endSeconds: 47.6 },
      { id: 'welsh', kind: 'tune', title: m.soundWelsh, endSeconds: 65 },
    ],
  },
  {
    title: m.soundGroupNature,
    sounds: [
      { id: 'womb', kind: 'loop', title: m.soundWomb, endSeconds: 45 },
      { id: 'waves', kind: 'loop', title: m.soundWaves, endSeconds: 45 },
      { id: 'brook', kind: 'loop', title: m.soundBrook, endSeconds: 45 },
      { id: 'birds', kind: 'loop', title: m.soundBirds, endSeconds: 45 },
      { id: 'summer-night', kind: 'loop', title: m.soundSummerNight, endSeconds: 45 },
    ],
  },
  {
    title: m.soundGroupNoise,
    sounds: [
      { id: 'white-noise', kind: 'loop', title: m.soundWhiteNoise, endSeconds: 45 },
      { id: 'brown-noise', kind: 'loop', title: m.soundBrownNoise, endSeconds: 45 },
      { id: 'shush', kind: 'loop', title: m.soundShush, endSeconds: 45 },
    ],
  },
] as const

export type Sound = (typeof SOUND_GROUPS)[number]['sounds'][number]
export type SoundId = Sound['id']

export const SOUNDS: readonly Sound[] = SOUND_GROUPS.flatMap((group) => [...group.sounds])

export const soundById = (id: SoundId): Sound =>
  SOUNDS.find((sound) => sound.id === id) ?? SOUND_GROUPS[0].sounds[0]

export const isSoundId = (value: unknown): value is SoundId =>
  SOUNDS.some((sound) => sound.id === value)

export const soundUrl = (id: SoundId, ending = false) => `/sounds/${id}${ending ? '-end' : ''}.m4a`

/** Timer choices, in minutes; null plays until stopped. */
export const TIMER_MINUTES = [15, 30, 60, null] as const
export type TimerMinutes = (typeof TIMER_MINUTES)[number]
export const isTimerMinutes = (value: unknown): value is TimerMinutes =>
  TIMER_MINUTES.some((minutes) => minutes === value)
