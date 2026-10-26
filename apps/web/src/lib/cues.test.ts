import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setAudioUse } from './audio'
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
    // The session's settling is timed with performance.now().
    vi.useFakeTimers({ toFake: ['setTimeout', 'performance'] })
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
    setAudioUse('sounds')
    vi.advanceTimersByTime(1000)
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

  it('stays silent with the microphone on, when following the silent switch', () => {
    setAudioUse('recording')
    playCue('start')
    vi.advanceTimersByTime(1000)
    expect(tones).toHaveLength(0)
  })

  it('waits for the session to follow the switch again after recording', () => {
    setAudioUse('recording')
    setAudioUse('sounds')
    playCue('send')
    expect(tones).toHaveLength(0)
    vi.advanceTimersByTime(300)
    expect(tones).toHaveLength(2)
  })

  it('sounds at once when set to sound through the switch, even with the microphone on', () => {
    setCueMode('always')
    setAudioUse('recording')
    playCue('start')
    expect(tones).toHaveLength(2)
  })
})
