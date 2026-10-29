import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import { Button } from '@lullabo/ui/button'
import { Card } from '@lullabo/ui/card'
import { SegmentedControl } from '@lullabo/ui/segmented-control'
import { Sheet } from '@lullabo/ui/sheet'
import { cn } from '@lullabo/ui/utils'
import { useState } from 'react'

import { MusicIcon } from '../../components/icons/MusicIcon'
import { createStoredValue, jsonCodec, useStore } from '../../lib/store'
import { useNow } from '../../lib/use-now'
import { m } from '../../paraglide/messages.js'
import { type Playing, playSound, setSoundTimer, stopSound, useSoundPlaying } from './player'
import {
  SOUND_GROUPS,
  type SoundId,
  TIMER_MINUTES,
  type TimerMinutes,
  isSoundId,
  isTimerMinutes,
  soundById,
} from './sounds'

interface Choice {
  sound: SoundId
  minutes: TimerMinutes
}
const DEFAULT_CHOICE: Choice = { sound: 'brahms', minutes: 30 }

/** The sound and timer last chosen on this device, offered next time. */
const lastChoice = createStoredValue<Choice>(
  'lullabo.sleepSound',
  jsonCodec((value) => {
    const { sound, minutes } = (value ?? {}) as Partial<Choice>
    return {
      sound: isSoundId(sound) ? sound : DEFAULT_CHOICE.sound,
      minutes: isTimerMinutes(minutes) ? minutes : DEFAULT_CHOICE.minutes,
    }
  }),
  DEFAULT_CHOICE,
)

const timerKey = (minutes: TimerMinutes) => (minutes === null ? 'none' : String(minutes))
const timerLabel = (minutes: TimerMinutes) =>
  minutes === null ? m.soundNoTimer() : m.soundMinutes({ minutes })

/** How the sound is getting on: paused, fading, or how long it has left. */
function Status({ playing }: { playing: Playing }) {
  // Mounted anew with each timer (keyed by its end), so the clock starts fresh with it.
  const now = useNow(30_000)
  if (playing.paused) return m.soundPaused()
  if (playing.ending) return m.soundEnding()
  if (playing.endsAt === null) return m.soundUntilStopped()
  return m.soundLeft({ minutes: Math.max(1, Math.ceil((playing.endsAt - now) / 60_000)) })
}

/**
 * What plays, on Today: the sound, how it is getting on, and stop; a tap opens the player.
 * It plays on until its timer runs out, it is stopped, or a baby wakes (SoundKeeper).
 */
export function NowPlaying() {
  const playing = useSoundPlaying()
  const [open, setOpen] = useState(false)
  return (
    <>
      {playing && (
        <Card tone="sleep" className="flex items-center gap-2 py-2 pr-2 pl-4">
          <button
            type="button"
            aria-label={m.soundChange()}
            onClick={() => setOpen(true)}
            className="flex min-h-touch min-w-0 flex-1 items-center gap-3 text-left"
          >
            <MusicIcon className="size-8 text-sleep-text" />
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-extrabold text-sleep-text">
                {soundById(playing.sound).title()}
              </span>
              <span className="text-caption text-muted-foreground">
                <Status key={playing.endsAt} playing={playing} />
              </span>
            </span>
          </button>
          <Button variant="outline" tone="sleep" onClick={stopSound}>
            {m.soundStop()}
          </Button>
        </Card>
      )}
      <SoundSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/**
 * The player's door on a sleeping baby's timer card, as well as in 更多. Once a sound plays,
 * the card on Today (NowPlaying) shows it instead; the sheet stays open across the change.
 */
export function SleepSoundButton() {
  const playing = useSoundPlaying()
  const [open, setOpen] = useState(false)
  return (
    <>
      {!playing && (
        <Button variant="soft" tone="sleep" onClick={() => setOpen(true)}>
          <MusicIcon className="size-5" />
          {m.soundOpen()}
        </Button>
      )}
      <SoundSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/**
 * The player: the timer first, always in reach, then the sounds. A tap on a sound plays it at
 * once, or switches to it while the timer runs on; the timer changes on its own. It stays open
 * to try one sound after another.
 */
export function SoundSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const mine = useSoundPlaying()
  const choice = useStore(lastChoice)
  const minutes = mine?.minutes ?? choice.minutes

  // Within the tap: browsers only start sound a person asked for.
  function pick(sound: SoundId) {
    lastChoice.set({ ...choice, sound })
    playSound(sound, minutes)
  }
  function time(next: TimerMinutes) {
    lastChoice.set({ ...choice, minutes: next })
    if (mine) setSoundTimer(next)
  }

  return (
    <Sheet open={open} onClose={onClose} title={m.soundTitle()}>
      <SegmentedControl
        label={m.soundTimer()}
        labelStyle="field"
        options={TIMER_MINUTES.map((option) => ({
          value: timerKey(option),
          label: timerLabel(option),
        }))}
        value={timerKey(minutes)}
        onChange={(key) => time(TIMER_MINUTES.find((option) => timerKey(option) === key) ?? null)}
      />
      {/* Stop sits beside the status, so the sounds below stay put when one starts. */}
      <div className="flex min-h-touch items-center gap-2">
        <p className="m-0 flex-1 text-caption text-muted-foreground">
          {mine ? <Status key={mine.endsAt} playing={mine} /> : m.soundPickHint()}
          {` · ${m.soundVolumeTip()}`}
        </p>
        {mine && (
          <Button variant="outline" tone="sleep" onClick={stopSound}>
            {m.soundStop()}
          </Button>
        )}
      </div>
      <RadioGroup
        aria-label={m.soundTitle()}
        value={mine?.sound ?? null}
        onValueChange={(sound) => {
          if (isSoundId(sound)) pick(sound)
        }}
        className="flex flex-col gap-4"
      >
        {SOUND_GROUPS.map((group) => (
          <SoundGroup key={group.title()} title={group.title()} sounds={group.sounds} />
        ))}
      </RadioGroup>
    </Sheet>
  )
}

function SoundGroup({
  title,
  sounds,
}: {
  title: string
  sounds: readonly { id: SoundId; title: () => string }[]
}) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
      <legend className="mb-1.5 p-0 font-bold">{title}</legend>
      <div className="grid grid-cols-2 gap-2">
        {sounds.map((sound) => (
          <Radio.Root
            key={sound.id}
            value={sound.id}
            className={cn(
              'press flex min-h-touch items-center justify-center rounded-lg border-2 border-b-4 px-2 text-center font-extrabold',
              'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-diaper',
              'border-border bg-muted text-muted-foreground',
              'data-[checked]:border-sleep data-[checked]:bg-sleep-soft data-[checked]:text-sleep-text',
            )}
          >
            {sound.title()}
          </Radio.Root>
        ))}
      </div>
    </fieldset>
  )
}
