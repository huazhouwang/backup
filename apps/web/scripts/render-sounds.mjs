// Renders the soothing sounds into public/sounds: two lullabies on a music box (Brahms's
// Wiegenlied and Twinkle Twinkle, both public domain) and three noises (white, soft brown
// and a rhythmic shush), each with an ending that fades out. Everything is synthesized here,
// deterministically, so there is no recording to license. Needs ffmpeg; the .m4a files are
// committed, so the build doesn't run this.
//
//   node scripts/render-sounds.mjs
//
// Volume can't be set on iOS (HTMLMediaElement.volume is read-only there), so the files are
// mastered quietly, and fading out at the end of the timer means playing the `-end` file.
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SR = 44_100
const OUT = fileURLToPath(new URL('../public/sounds/', import.meta.url))
const TMP = join(tmpdir(), 'lullabo-sounds')

/** A seeded random source (mulberry32), so every render is the same. */
function random(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

const rms = (x) => Math.sqrt(x.reduce((sum, v) => sum + v * v, 0) / x.length)
const peak = (x) => x.reduce((max, v) => Math.max(max, Math.abs(v)), 0)
const scale = (x, gain) => x.map((v) => v * gain)

/** One-pole low-pass, in place. */
function lowPass(x, hz) {
  const k = 1 - Math.exp((-2 * Math.PI * hz) / SR)
  let y = 0
  for (let i = 0; i < x.length; i += 1) x[i] = y += k * (x[i] - y)
  return x
}
/** One-pole high-pass, in place. */
function highPass(x, hz) {
  const k = Math.exp((-2 * Math.PI * hz) / SR)
  let prevX = 0
  let y = 0
  for (let i = 0; i < x.length; i += 1) {
    y = k * (y + x[i] - prevX)
    prevX = x[i]
    x[i] = y
  }
  return x
}

/** A small Schroeder reverb: a soft room around the music box. */
function reverb(dry, wet = 0.22) {
  const combs = [1557, 1617, 1491, 1422].map((delay) => ({
    delay,
    buf: new Float64Array(delay),
    i: 0,
    low: 0,
  }))
  const allpasses = [225, 556].map((delay) => ({ delay, buf: new Float64Array(delay), i: 0 }))
  const out = new Float64Array(dry.length)
  for (let n = 0; n < dry.length; n += 1) {
    let sum = 0
    for (const c of combs) {
      const y = c.buf[c.i]
      c.low = y * 0.6 + c.low * 0.4
      c.buf[c.i] = dry[n] * 0.015 + c.low * 0.8
      c.i = (c.i + 1) % c.delay
      sum += y
    }
    for (const a of allpasses) {
      const y = a.buf[a.i]
      a.buf[a.i] = sum + y * 0.5
      a.i = (a.i + 1) % a.delay
      sum = y - sum * 0.5
    }
    out[n] = dry[n] + wet * sum
  }
  return out
}

/** Adds one music box note: a plucked tine, its overtones dying away faster than it. */
function pluck(buf, at, midi, velocity) {
  const f = 440 * 2 ** ((midi - 69) / 12)
  const start = Math.round(at * SR)
  const length = Math.min(buf.length - start, Math.round(3.5 * SR))
  for (let i = 0; i < length; i += 1) {
    const t = i / SR
    const w = 2 * Math.PI * f * t
    const attack = 1 - Math.exp(-t / 0.004)
    buf[start + i] +=
      velocity *
      attack *
      (Math.sin(w) * Math.exp(-t / 1.6) +
        0.3 * Math.sin(2 * w) * Math.exp(-t / 0.6) +
        0.08 * Math.sin(3 * w) * Math.exp(-t / 0.3) +
        0.04 * Math.sin(5.4 * w) * Math.exp(-t / 0.08))
  }
}

const C4 = 60
const [C, D, E, F, G, A, B, C2] = [0, 2, 4, 5, 7, 9, 11, 12].map((step) => C4 + step)

/** Notes as [pitch, beats], written in C. */
const BRAHMS = {
  bpm: 66,
  beatsPerBar: 3,
  pickup: 1,
  notes: [
    [E, 0.5],
    [E, 0.5],
    [G, 1.5],
    [E, 0.5],
    [E, 1],
    [G, 2],
    [E, 0.5],
    [G, 0.5],
    [C2, 1],
    [B, 1.5],
    [A, 0.5],
    [A, 1],
    [G, 1],
    [D, 0.5],
    [E, 0.5],
    [F, 1],
    [D, 1],
    [D, 0.5],
    [E, 0.5],
    [F, 2],
    [D, 0.5],
    [F, 0.5],
    [B, 0.5],
    [A, 0.5],
    [G, 1],
    [B, 1],
    [C2, 2],
    [C, 0.5],
    [C, 0.5],
    [C2, 2],
    [A, 0.5],
    [F, 0.5],
    [G, 2],
    [E, 0.5],
    [C, 0.5],
    [F, 1],
    [G, 1],
    [A, 1],
    [G, 2],
    [C, 0.5],
    [C, 0.5],
    [C2, 2],
    [A, 0.5],
    [F, 0.5],
    [G, 2],
    [E, 0.5],
    [C, 0.5],
    [F, 1],
    [E, 1],
    [D, 1],
    [C, 3],
  ],
}
const TWINKLE = {
  bpm: 76,
  beatsPerBar: 4,
  pickup: 0,
  notes: [
    [C, 1],
    [C, 1],
    [G, 1],
    [G, 1],
    [A, 1],
    [A, 1],
    [G, 2],
    [F, 1],
    [F, 1],
    [E, 1],
    [E, 1],
    [D, 1],
    [D, 1],
    [C, 2],
    [G, 1],
    [G, 1],
    [F, 1],
    [F, 1],
    [E, 1],
    [E, 1],
    [D, 2],
    [G, 1],
    [G, 1],
    [F, 1],
    [F, 1],
    [E, 1],
    [E, 1],
    [D, 2],
    [C, 1],
    [C, 1],
    [G, 1],
    [G, 1],
    [A, 1],
    [A, 1],
    [G, 2],
    [F, 1],
    [F, 1],
    [E, 1],
    [E, 1],
    [D, 1],
    [D, 1],
    [C, 2],
  ],
}

/**
 * One pass of a tune, in G, with room for the last notes and the reverb to die away. With
 * `fading`, it grows quieter to the end: the ending after the timer.
 */
function tune({ bpm, beatsPerBar, pickup, notes }, fading = false) {
  const beat = 60 / bpm
  const total = notes.reduce((sum, [, beats]) => sum + beats, 0)
  const buf = new Float64Array(Math.round((total * beat + 4) * SR))
  const rand = random(7)
  let beats = 0
  for (const [pitch, length] of notes) {
    const downbeat = (beats - pickup + beatsPerBar) % beatsPerBar === 0
    const progress = beats / total
    const velocity =
      (downbeat ? 1 : 0.82) * (0.94 + rand() * 0.06) * (fading ? 1 - 0.8 * progress : 1)
    // A hair late now and then, as a cylinder turned by hand.
    pluck(buf, 0.05 + beats * beat + rand() * 0.012, pitch + 7, velocity)
    beats += length
  }
  const out = reverb(buf)
  // The last half second goes to silence, so passes join without a click.
  const tail = Math.round(0.5 * SR)
  for (let i = 0; i < tail; i += 1) out[out.length - tail + i] *= 1 - i / tail
  return scale(out, 0.25 / peak(out))
}

/** Gaussian-ish noise from a seeded source. */
function noise(seconds, seed) {
  const rand = random(seed)
  return Float64Array.from({ length: Math.round(seconds * SR) }, () => rand() + rand() - 1)
}

const NOISES = {
  /** White noise with the hiss taken off the top. */
  'white-noise': (seconds, seed) => lowPass(noise(seconds, seed), 7000),
  /** Brown noise: deep and soft, like a fan or far-off water. */
  'brown-noise': (seconds, seed) => {
    const x = noise(seconds, seed)
    let y = 0
    for (let i = 0; i < x.length; i += 1) x[i] = y = (y + 0.02 * x[i]) / 1.02
    return highPass(x, 25)
  },
  /** Shushing in a slow rhythm, as a parent does. */
  shush: (seconds, seed) => {
    const x = lowPass(highPass(highPass(noise(seconds, seed), 1500), 1500), 6500)
    const cycle = 3 * SR
    for (let i = 0; i < x.length; i += 1) {
      const t = (i % cycle) / SR
      const shape = t < 0.4 ? t / 0.4 : t < 1.8 ? 1 : t < 2.6 ? 1 - (t - 1.8) / 0.8 : 0
      x[i] *= 0.12 + 0.88 * Math.sin((shape * Math.PI) / 2) ** 2
    }
    return x
  },
}
const NOISE_LEVEL = { 'white-noise': 0.045, 'brown-noise': 0.07, shush: 0.04 }
const LOOP_SECONDS = 60
const END_SECONDS = 45

/** A loop that joins itself without a seam: its last seconds cross-fade into its first. */
function seamless(make, seed) {
  const fade = 2 * SR
  const x = make(LOOP_SECONDS + 2, seed)
  const loop = x.slice(0, LOOP_SECONDS * SR)
  for (let i = 0; i < fade; i += 1) {
    const t = i / fade
    loop[i] =
      loop[i] * Math.sin((t * Math.PI) / 2) + x[LOOP_SECONDS * SR + i] * Math.cos((t * Math.PI) / 2)
  }
  return loop
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2)
  for (let i = 0; i < samples.length; i += 1) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32_767), i * 2)
  }
  const head = Buffer.alloc(44)
  head.write('RIFF', 0)
  head.writeUInt32LE(36 + data.length, 4)
  head.write('WAVEfmt ', 8)
  head.writeUInt32LE(16, 16)
  head.writeUInt16LE(1, 20)
  head.writeUInt16LE(1, 22)
  head.writeUInt32LE(SR, 24)
  head.writeUInt32LE(SR * 2, 28)
  head.writeUInt16LE(2, 32)
  head.writeUInt16LE(16, 34)
  head.write('data', 36)
  head.writeUInt32LE(data.length, 40)
  return Buffer.concat([head, data])
}

/** Encodes to AAC in .m4a, which every browser the app runs in plays. */
function save(name, samples, bitrate) {
  const source = join(TMP, `${name}.wav`)
  writeFileSync(source, wav(samples))
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
    // No date or encoder version in the file, so a re-render changes nothing.
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

rmSync(TMP, { recursive: true, force: true })
mkdirSync(TMP, { recursive: true })
mkdirSync(OUT, { recursive: true })

for (const [name, melody] of Object.entries({ brahms: BRAHMS, twinkle: TWINKLE })) {
  save(name, tune(melody), '64k')
  save(`${name}-end`, tune(melody, true), '64k')
}
for (const [name, make] of Object.entries(NOISES)) {
  const loop = seamless(make, 1)
  const level = NOISE_LEVEL[name] / rms(loop)
  save(name, scale(loop, level), '48k')
  // The ending carries on from the loop's start, so it follows on from any point unnoticed,
  // and fades away.
  const end = make(END_SECONDS, 2)
  const length = end.length
  save(
    `${name}-end`,
    end.map((v, i) => (v * level * (Math.cos((Math.PI * i) / length) + 1)) / 2),
    '48k',
  )
}
rmSync(TMP, { recursive: true, force: true })
