import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { playCue, setCueMode } from './cues'

describe('playCue', () => {
  const audioSession = { type: 'ambient' }
  const tones: number[] = []
  // Counts the tones a cue makes; nothing really sounds.
  const node = () => ({
    connect: (next: unknown) => next,
    start: () => tones.push(1),
    stop: () => undefined,
    frequency: { value: 0 },
    gain: {
      setValueAtTime: () => undefined,
      linearRampToValueAtTime: () => undefined,
      exponentialRampToValueAtTime: () => undefined,
    },
  })
  beforeEach(() => {
    vi.useFakeTimers()
    // A browser: the stored setting is read there, not on the server.
    vi.stubGlobal('window', globalThis)
    vi.stubGlobal('navigator', { audioSession })
    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'running'
        currentTime = 0
        destination = {}
        resume = async () => undefined
        createOscillator = node
        createGain = node
      },
    )
  })
  afterEach(() => {
    setCueMode('switch')
    tones.length = 0
    audioSession.type = 'ambient'
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('follows the silent switch by default, mixing with other apps', () => {
    playCue('reply')
    expect(tones).toHaveLength(3)
    expect(audioSession.type).toBe('ambient')
  })

  it('sounds through the silent switch for as long as the cue, when set to', () => {
    setCueMode('always')
    playCue('send')
    expect(audioSession.type).toBe('playback')
    vi.advanceTimersByTime(1000)
    expect(audioSession.type).toBe('ambient')
  })

  it('plays nothing when off', () => {
    setCueMode('off')
    playCue('error')
    expect(tones).toHaveLength(0)
  })
})
