// The lullabies' melodies, all public domain, written in C a bar at a time as "pitch beats"
// pairs ("r" is a rest) and checked against their bars. Transcribed from the scores in the
// Wikipedia articles on each song (Twinkle, Brahms, Mo Li Hua, Frère Jacques, Schlaf,
// Kindlein, schlaf, Der Mond ist aufgegangen, Suo Gân); render.mjs plays them on a music box.

const STEPS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/** MIDI number of a pitch such as "E4" or "C5"; null for a rest. */
function midi(pitch) {
  if (pitch === 'r') return null
  const step = STEPS[pitch[0]]
  const octave = Number(pitch.slice(1))
  if (step === undefined || !Number.isInteger(octave)) throw new Error(`bad pitch ${pitch}`)
  return 12 * (octave + 1) + step
}

/** A melody's notes as [midi | null, beats], every bar checked against the time signature. */
function melody(name, { beatsPerBar, pickup = 0, bars }) {
  return bars.flatMap((bar, index) => {
    const words = bar.trim().split(/\s+/)
    const notes = []
    for (let i = 0; i < words.length; i += 2) notes.push([midi(words[i]), Number(words[i + 1])])
    const beats = notes.reduce((sum, [, length]) => sum + length, 0)
    const expected = index === 0 && pickup ? pickup : beatsPerBar
    // The last bar may be cut short after a pickup, as written.
    const last = index === bars.length - 1 && pickup && beats === beatsPerBar - pickup
    if (beats !== expected && !last) throw new Error(`${name} bar ${index + 1}: ${beats} beats`)
    return notes
  })
}

const tune = (name, spec) => ({ ...spec, notes: melody(name, spec) })

const twice = (bars) => [...bars, ...bars]

export const TUNES = {
  brahms: tune('brahms', {
    bpm: 66,
    beatsPerBar: 3,
    pickup: 1,
    bars: [
      'E4 .5 E4 .5',
      'G4 1.5 E4 .5 E4 1',
      'G4 2 E4 .5 G4 .5',
      'C5 1 B4 1.5 A4 .5',
      'A4 1 G4 1 D4 .5 E4 .5',
      'F4 1 D4 1 D4 .5 E4 .5',
      'F4 2 D4 .5 F4 .5',
      'B4 .5 A4 .5 G4 1 B4 1',
      'C5 2 C4 .5 C4 .5',
      'C5 2 A4 .5 F4 .5',
      'G4 2 E4 .5 C4 .5',
      'F4 1 G4 1 A4 1',
      'G4 2 C4 .5 C4 .5',
      'C5 2 A4 .5 F4 .5',
      'G4 2 E4 .5 C4 .5',
      'F4 1 E4 1 D4 1',
      'C4 3',
    ],
  }),
  twinkle: tune('twinkle', {
    bpm: 72,
    beatsPerBar: 4,
    bars: [
      'C4 1 C4 1 G4 1 G4 1',
      'A4 1 A4 1 G4 2',
      'F4 1 F4 1 E4 1 E4 1',
      'D4 1 D4 1 C4 2',
      ...twice(['G4 1 G4 1 F4 1 F4 1', 'E4 1 E4 1 D4 2']),
      'C4 1 C4 1 G4 1 G4 1',
      'A4 1 A4 1 G4 2',
      'F4 1 F4 1 E4 1 E4 1',
      'D4 1 D4 1 C4 2',
    ],
  }),
  /** 茉莉花 */
  jasmine: tune('jasmine', {
    bpm: 72,
    beatsPerBar: 4,
    bars: [
      ...twice(['E4 1 E4 .5 G4 .5 A4 .5 C5 .5 C5 .5 A4 .5', 'G4 1 G4 .5 A4 .5 G4 1 r 1']),
      'G4 1 G4 1 G4 1 E4 .5 G4 .5',
      'A4 1 A4 1 G4 2',
      'E4 1 D4 .5 E4 .5 G4 1 E4 .5 D4 .5',
      'C4 1 C4 .5 D4 .5 C4 2',
      'E4 .5 D4 .5 C4 .5 E4 .5 D4 1.5 E4 .5',
      'G4 1 A4 .5 C5 .5 G4 2',
      'D4 1 E4 .5 G4 .5 D4 .5 E4 .5 C4 .5 A3 .5',
      'G3 2 A3 1 C4 1',
      'D4 1.5 E4 .5 C4 .5 D4 .5 C4 .5 A3 .5',
      'G3 2 r 2',
    ],
  }),
  /** 两只老虎: Frère Jacques, slowly, twice over. */
  tigers: tune('tigers', {
    bpm: 72,
    beatsPerBar: 4,
    bars: twice([
      ...twice(['C4 1 D4 1 E4 1 C4 1']),
      ...twice(['E4 1 F4 1 G4 2']),
      ...twice(['G4 .5 A4 .5 G4 .5 F4 .5 E4 1 C4 1']),
      ...twice(['C4 1 G3 1 C4 2']),
    ]),
  }),
  /** Schlaf, Kindlein, schlaf, twice over. */
  sleepy: tune('sleepy', {
    bpm: 60,
    beatsPerBar: 2,
    bars: twice([
      'E4 1 D4 .5 D4 .5',
      'C4 1 r .5 G3 .5',
      'E4 .5 E4 .5 D4 .5 D4 .5',
      'C4 1 r .5 G3 .5',
      'F4 .5 F4 .5 D4 .5 D4 .5',
      'G4 .5 G4 .5 E4 .5 E4 .5',
      'F4 .5 F4 .5 D4 .5 D4 .5',
      'G4 .5 G4 .5 E4 1',
      'F4 1 D4 .5 D4 .5',
      'C4 2',
    ]),
  }),
  /** Der Mond ist aufgegangen, with its repeat. */
  moon: tune('moon', {
    bpm: 66,
    beatsPerBar: 4,
    pickup: 1,
    bars: [
      'C4 1',
      'D4 1 C4 1 F4 1 E4 1',
      'D4 2 C4 1 E4 1',
      'E4 1 E4 1 A4 1 G4 1',
      'F4 2 E4 1 E4 1',
      'E4 1 E4 1 F4 1 E4 1',
      'D4 3 C4 1',
      'D4 1 C4 1 F4 1 E4 1',
      'D4 2 C4 1 E4 1',
      'E4 1 E4 1 A4 1 G4 1',
      'F4 2 E4 1 E4 1',
      'E4 1 E4 1 F4 1 E4 1',
      'D4 1 D4 1 C4 1',
    ],
  }),
  /** Suo Gân, the Welsh lullaby: its verse twice, the middle, the verse again. */
  welsh: tune('welsh', {
    bpm: 63,
    beatsPerBar: 4,
    bars: (() => {
      const verse = [
        'C4 1.5 D4 .5 E4 .5 G4 1.5',
        'D4 1.5 C4 .5 E4 .5 D4 1.5',
        'C4 1.5 D4 .5 E4 .5 G4 1.5',
        'D4 1 E4 1 C4 2',
      ]
      return [
        ...verse,
        ...verse,
        'E4 1.5 F4 .5 G4 .5 E4 1.5',
        'A4 1.5 F4 .5 G4 .5 E4 1.5',
        'E4 1.5 F4 .5 G4 .5 E4 1.5',
        'C5 1.5 A4 .5 G4 2',
        ...verse,
      ]
    })(),
  }),
}
