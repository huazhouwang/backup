import { describe, expect, it } from 'vitest'

import { NOTHING_SAID_MS, PAUSE_MS, levelOf, listenForPause } from './silence'

/** Feeds levels every 50 ms from `from`, returning the last hearing and when it came. */
function play(hear: ReturnType<typeof listenForPause>, from: number, ms: number, level: number) {
  let last = hear(level, from)
  for (let t = from + 50; t <= from + ms; t += 50) last = hear(level, t)
  return last
}

describe('hearing when a hands-free speaker has finished', () => {
  it('sends after a pause once something was said', () => {
    const hear = listenForPause()
    play(hear, 0, 450, 0.005) // the room
    expect(play(hear, 500, 1000, 0.1).spoken).toBe(true)
    const halfway = play(hear, 1550, PAUSE_MS / 2, 0.006)
    expect(halfway.pause).toBeGreaterThan(0.4)
    expect(halfway.over).toBe(false)
    expect(play(hear, 1550 + PAUSE_MS / 2 + 50, PAUSE_MS / 2, 0.006).over).toBe(true)
  })

  it('starts the pause again when speaking goes on', () => {
    const hear = listenForPause()
    play(hear, 0, 450, 0.005)
    play(hear, 500, 600, 0.1)
    play(hear, 1150, 1000, 0.006)
    const again = play(hear, 2200, 300, 0.1)
    expect(again.pause).toBe(0)
    expect(again.over).toBe(false)
  })

  it('takes a noisy room as the room, not as speech', () => {
    const hear = listenForPause()
    play(hear, 0, 450, 0.03) // a fan
    const fan = play(hear, 500, 3000, 0.035)
    expect(fan.spoken).toBe(false)
    expect(play(hear, 3550, 600, 0.2).spoken).toBe(true)
  })

  it('gives up when nothing is said', () => {
    const hear = listenForPause()
    expect(play(hear, 0, NOTHING_SAID_MS - 100, 0.005).over).toBe(false)
    expect(play(hear, NOTHING_SAID_MS, 100, 0.005).over).toBe(true)
  })

  it('measures a level from the analyser’s bytes', () => {
    expect(levelOf(new Uint8Array([128, 128]))).toBe(0)
    expect(levelOf(new Uint8Array([192, 64]))).toBeCloseTo(0.5)
  })
})
