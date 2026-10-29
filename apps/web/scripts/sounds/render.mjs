// Renders the soothing sounds into public/sounds, each with an `-end` file that fades out:
//
// - Lullabies (tunes.mjs, all public domain) played on a real music box: one recorded note
//   per tine, the A-flat major scale over two octaves, so every tune is played in A-flat.
// - Nature: waves, birds at dawn, a brook, wind over a field and a summer night in a meadow,
//   recorded in France by Joseph Sardin for BigSoundBank (https://bigsoundbank.com), released
//   under CC0 1.0: free to use, change and share, attribution not required but given here
//   with thanks.
// - Synthesized here: the womb (a muffled whoosh with a heartbeat), white and brown noise,
//   and a rhythmic shush.
//
// Needs ffmpeg and a connection (the recordings are fetched from BigSoundBank). The .m4a
// files are committed; the build doesn't run this. Every render is the same.
//
//   node scripts/sounds/render.mjs
//
// Volume can't be set on iOS (HTMLMediaElement.volume is read-only there), so the files are
// mastered quietly, and fading out at the end of the timer means playing the `-end` file.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  SR,
  decode,
  fadeAway,
  highPass,
  lowPass,
  noise,
  peak,
  random,
  reverb,
  rms,
  scale,
  seamless,
  wav,
} from './dsp.mjs'
import { TUNES } from './tunes.mjs'

const OUT = fileURLToPath(new URL('../../public/sounds/', import.meta.url))
const TMP = join(tmpdir(), 'lullabo-sounds')
// Downloads are kept apart from what is rendered, and only ever decoded by ffmpeg.
const DOWNLOADS = join(TMP, 'downloads')

/** A BigSoundBank recording by its number, fetched once. */
function recording(id) {
  const path = join(DOWNLOADS, `${id}.ogg`)
  if (!existsSync(path)) {
    execFileSync('curl', [
      '-sSfL',
      '-m',
      '120',
      '-o',
      path,
      `https://bigsoundbank.com/UPLOAD/ogg/${id}.ogg`,
    ])
  }
  return path
}

/** The music box: one recorded tine per note, by MIDI number (measured, A-flat major). */
const TINES = {
  68: '1865', // A♭4
  70: '1866', // B♭4
  72: '1867', // C5
  73: '1868', // D♭5
  75: '1869', // E♭5
  77: '1870', // F5
  79: '1871', // G5
  80: '1872', // A♭5
  82: '1873', // B♭5
  84: '1874', // C6
  85: '1875', // D♭6
  87: '1876', // E♭6
  89: '1877', // F6
  91: '1878', // G6
  92: '1879', // A♭6
}
/** C major's steps land on A-flat major's: up a minor sixth and an octave. */
const TO_A_FLAT = 20

/** Each tine's note, from its pluck on, at the same peak. */
const tines = new Map()
function tine(note) {
  if (!tines.has(note)) {
    const id = TINES[note]
    if (!id) throw new Error(`no tine for ${note}`)
    const x = decode(recording(id))
    const top = peak(x)
    const onset = Math.max(0, x.findIndex((v) => Math.abs(v) > 0.3 * top) - Math.round(0.004 * SR))
    tines.set(note, scale(x.slice(onset), 1 / top))
  }
  return tines.get(note)
}

/**
 * One pass of a tune on the music box, with room for the last notes and the reverb to die
 * away. With `fading`, it grows quieter to the end: the ending after the timer.
 */
function playTune({ bpm, beatsPerBar, pickup = 0, notes }, fading = false) {
  const beat = 60 / bpm
  const total = notes.reduce((sum, [, beats]) => sum + beats, 0)
  const buf = new Float64Array(Math.round((total * beat + 4) * SR))
  const rand = random(7)
  let beats = 0
  for (const [pitch, length] of notes) {
    if (pitch !== null) {
      const downbeat = (beats - pickup + beatsPerBar) % beatsPerBar === 0
      const velocity =
        (downbeat ? 1 : 0.8) * (0.93 + rand() * 0.07) * (fading ? 1 - 0.8 * (beats / total) : 1)
      // A hair late now and then, as a cylinder turned by hand.
      const start = Math.round((0.05 + beats * beat + rand() * 0.01) * SR)
      const sound = tine(pitch + TO_A_FLAT)
      for (let i = 0; i < sound.length && start + i < buf.length; i += 1) {
        buf[start + i] += velocity * sound[i]
      }
    }
    beats += length
  }
  const out = reverb(buf, 0.12)
  // The last half second goes to silence, so passes join without a click.
  const tail = Math.round(0.5 * SR)
  for (let i = 0; i < tail; i += 1) out[out.length - tail + i] *= 1 - i / tail
  return scale(out, 0.32 / peak(out))
}

const LOOP_SECONDS = 60
const END_SECONDS = 45

/**
 * The nature recordings: the steadiest stretch of each (found by its loudness second by
 * second) loops, another stretch fades away as its ending. Birds, waves and wind are evened
 * out a little so no call, wave or gust stands out of the rest.
 */
const NATURE = {
  waves: { id: '1046', loop: 56, end: 5, level: 0.042, even: true }, // Houlgate, Normandy
  birds: { id: '1906', loop: 301, end: 250, level: 0.035, even: true }, // country dawn, May
  brook: { id: '0864', loop: 4, end: 30, level: 0.045 },
  'summer-night': { id: '1880', loop: 222, end: 150, level: 0.045 }, // crickets, a few frogs
  field: { id: '1097', loop: 70, end: 150, level: 0.04, even: true }, // wind in a field of corn
}
const LOOP_NATURE = 70

function nature({ id, loop, end, level, even }) {
  const filter = [
    'highpass=f=40',
    ...(even ? ['acompressor=threshold=-32dB:ratio=4:attack=20:release=500:makeup=1'] : []),
  ].join(',')
  const source = recording(id)
  const looped = seamless(
    // A second to spare: a decoder can come up a little short after seeking.
    decode(source, { start: loop, seconds: LOOP_NATURE + 3, filter }),
    LOOP_NATURE,
  )
  const gain = level / rms(looped)
  return {
    loop: scale(looped, gain),
    end: fadeAway(scale(decode(source, { start: end, seconds: END_SECONDS, filter }), gain)),
  }
}

/**
 * The womb, as a baby hears it: a deep whoosh of blood swelling with each beat of a calm
 * heart (70 a minute), muffled, the beat itself a soft low thump. 70 beats fill the minute,
 * so the loop and its ending carry on from any beat.
 */
function womb(seconds, seed) {
  const x = noise(seconds, seed)
  let y = 0
  for (let i = 0; i < x.length; i += 1) x[i] = y = (y + 0.02 * x[i]) / 1.02
  lowPass(lowPass(highPass(x, 30), 380), 380)
  const beat = 60 / 70
  for (let i = 0; i < x.length; i += 1) {
    const t = (i / SR) % beat
    // The whoosh swells just after each beat and ebbs until the next.
    const swell = Math.exp(-((t - 0.18) ** 2) / 0.02)
    // Lub, then dub: low thumps, quickly gone.
    const thump = (at, f, size) =>
      t > at ? size * Math.sin(2 * Math.PI * f * (t - at)) * Math.exp(-(t - at) / 0.05) : 0
    x[i] = x[i] * (0.55 + 0.45 * swell) + 0.012 * (thump(0, 52, 1) + thump(0.3, 46, 0.6))
  }
  return x
}

/** White noise with the hiss taken off the top. */
const whiteNoise = (seconds, seed) => lowPass(noise(seconds, seed), 7000)
/** Brown noise: deep and soft, like a fan or far-off water. */
function brownNoise(seconds, seed) {
  const x = noise(seconds, seed)
  let y = 0
  for (let i = 0; i < x.length; i += 1) x[i] = y = (y + 0.02 * x[i]) / 1.02
  return highPass(x, 25)
}
/** Shushing in a slow rhythm, as a parent does. */
function shush(seconds, seed) {
  const x = lowPass(highPass(highPass(noise(seconds, seed), 1500), 1500), 6500)
  const cycle = 3 * SR
  for (let i = 0; i < x.length; i += 1) {
    const t = (i % cycle) / SR
    const shape = t < 0.4 ? t / 0.4 : t < 1.8 ? 1 : t < 2.6 ? 1 - (t - 1.8) / 0.8 : 0
    x[i] *= 0.12 + 0.88 * Math.sin((shape * Math.PI) / 2) ** 2
  }
  return x
}
const SYNTHESIZED = {
  womb: { make: womb, level: 0.06 },
  'white-noise': { make: whiteNoise, level: 0.045 },
  'brown-noise': { make: brownNoise, level: 0.07 },
  shush: { make: shush, level: 0.04 },
}

/** Encodes to AAC in .m4a, which every browser the app runs in plays. */
function save(name, samples, bitrate) {
  const source = join(TMP, `${name}.wav`)
  writeFileSync(source, wav(samples))
  // No date or encoder version in the file, so a re-render changes nothing.
  execFileSync('ffmpeg', [
    '-loglevel',
    'error',
    '-y',
    '-i',
    source,
    '-c:a',
    'aac',
    '-b:a',
    bitrate,
    '-ac',
    '1',
    '-movflags',
    '+faststart',
    '-map_metadata',
    '-1',
    '-fflags',
    '+bitexact',
    '-flags:a',
    '+bitexact',
    join(OUT, `${name}.m4a`),
  ])
  console.log(`${name}: ${(samples.length / SR).toFixed(1)}s`)
}

rmSync(join(TMP, '*.wav'), { force: true })
mkdirSync(DOWNLOADS, { recursive: true })
mkdirSync(OUT, { recursive: true })

for (const [name, melody] of Object.entries(TUNES)) {
  save(name, playTune(melody), '64k')
  save(`${name}-end`, playTune(melody, true), '64k')
}
for (const [name, spec] of Object.entries(NATURE)) {
  const { loop, end } = nature(spec)
  save(name, loop, '64k')
  save(`${name}-end`, end, '64k')
}
for (const [name, { make, level }] of Object.entries(SYNTHESIZED)) {
  const loop = seamless(make(LOOP_SECONDS + 2, 1), LOOP_SECONDS)
  const gain = level / rms(loop)
  save(name, scale(loop, gain), '48k')
  // The ending carries on from the loop's start, so it follows on from any point unnoticed.
  save(`${name}-end`, fadeAway(scale(make(END_SECONDS, 2), gain)), '48k')
}
