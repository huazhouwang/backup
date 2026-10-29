// Small signal helpers for render.mjs: everything at one sample rate, mono, as Float64Array.
import { execFileSync } from 'node:child_process'

export const SR = 44_100

/** A seeded random source (mulberry32), so every render is the same. */
export function random(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

export const rms = (x) => Math.sqrt(x.reduce((sum, v) => sum + v * v, 0) / x.length)
export const peak = (x) => x.reduce((max, v) => Math.max(max, Math.abs(v)), 0)
export const scale = (x, gain) => x.map((v) => v * gain)

/** One-pole low-pass, in place. */
export function lowPass(x, hz) {
  const k = 1 - Math.exp((-2 * Math.PI * hz) / SR)
  let y = 0
  for (let i = 0; i < x.length; i += 1) x[i] = y += k * (x[i] - y)
  return x
}
/** One-pole high-pass, in place. */
export function highPass(x, hz) {
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
export function reverb(dry, wet = 0.22) {
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

/** Gaussian-ish noise from a seeded source. */
export function noise(seconds, seed) {
  const rand = random(seed)
  return Float64Array.from({ length: Math.round(seconds * SR) }, () => rand() + rand() - 1)
}

/**
 * An audio file decoded by ffmpeg, mono at SR, from `start` for `seconds` (all of it when
 * omitted), through an optional ffmpeg filter chain.
 */
export function decode(path, { start = 0, seconds, filter } = {}) {
  const raw = execFileSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-ss',
      String(start),
      ...(seconds === undefined ? [] : ['-t', String(seconds)]),
      '-i',
      path,
      '-ac',
      '1',
      '-ar',
      String(SR),
      ...(filter ? ['-af', filter] : []),
      '-f',
      'f64le',
      '-',
    ],
    { maxBuffer: 1 << 30 },
  )
  return new Float64Array(raw.buffer, raw.byteOffset, raw.byteLength / 8).slice()
}

/**
 * A loop of `seconds` that joins itself without a seam: its last two seconds cross-fade into
 * its first. `x` must run two seconds longer than the loop.
 */
export function seamless(x, seconds) {
  const fade = 2 * SR
  const length = Math.round(seconds * SR)
  if (x.length < length + fade) throw new Error(`${x.length} samples are too few to loop`)
  const loop = x.slice(0, length)
  for (let i = 0; i < fade; i += 1) {
    const t = i / fade
    loop[i] = loop[i] * Math.sin((t * Math.PI) / 2) + x[length + i] * Math.cos((t * Math.PI) / 2)
  }
  return loop
}

/** Fades to silence over its whole length: an ending. */
export const fadeAway = (x) => x.map((v, i) => (v * (Math.cos((Math.PI * i) / x.length) + 1)) / 2)

export function wav(samples) {
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
