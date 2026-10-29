import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import { Button } from '@lullabo/ui/button'
import { SegmentedControl } from '@lullabo/ui/segmented-control'
import { Sheet } from '@lullabo/ui/sheet'
import { cn } from '@lullabo/ui/utils'
import { useState } from 'react'

import { MusicIcon } from '../../components/icons/MusicIcon'
import { createStoredValue, jsonCodec, useStore } from '../../lib/store'
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
function status(playing: Playing, now: number) {
  if (playing.paused) return m.soundPaused()
  if (playing.ending) return m.soundEnding()
  if (playing.endsAt === null) return m.soundUntilStopped()
  return m.soundLeft({ minutes: Math.max(1, Math.ceil((playing.endsAt - now) / 60_000)) })
}

/**
 * Soothing sounds for a sleep, on its timer card: a button that opens the player, then what
 * plays and for how much longer, with stop. It stops when the sleep ends (SoundKeeper).
 */
export function SleepSound({ sleepId, now }: { sleepId: string; now: number }) {
  const playing = useSoundPlaying()
  const [picking, setPicking] = useState(false)
  const mine = playing?.sleepId === sleepId ? playing : null

  return (
    <>
      {mine ? (
        <div className="flex items-center gap-2 rounded-lg bg-background py-1 pr-1 pl-3">
          <button
            type="button"
            aria-label={m.soundChange()}
            onClick={() => setPicking(true)}
            className="flex min-h-touch min-w-0 flex-1 items-center gap-3 text-left"
          >
            <MusicIcon className="size-6 text-sleep-text" />
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-bold">{soundById(mine.sound).title()}</span>
              <span className="text-caption text-muted-foreground">{status(mine, now)}</span>
            </span>
          </button>
          <Button variant="ghost" tone="sleep" onClick={stopSound}>
            {m.soundStop()}
          </Button>
        </div>
      ) : (
        <Button variant="soft" tone="sleep" onClick={() => setPicking(true)}>
          <MusicIcon className="size-5" />
          {m.soundOpen()}
        </Button>
      )}
      <SoundSheet sleepId={sleepId} now={now} open={picking} onClose={() => setPicking(false)} />
    </>
  )
}

/**
 * The player: the timer first, always in reach, then the sounds. A tap on a sound plays it at
 * once, or switches to it while the timer runs on; the timer changes on its own. It stays open
 * to try one sound after another.
 */
function SoundSheet({
  sleepId,
  now,
  open,
  onClose,
}: {
  sleepId: string
  now: number
  open: boolean
  onClose: () => void
}) {
  const playing = useSoundPlaying()
  const mine = playing?.sleepId === sleepId ? playing : null
  const choice = useStore(lastChoice)
  const minutes = mine?.minutes ?? choice.minutes

  // Within the tap: browsers only start sound a person asked for.
  function pick(sound: SoundId) {
    lastChoice.set({ ...choice, sound })
    playSound(sound, sleepId, minutes)
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
          {`${mine ? status(mine, now) : m.soundPickHint()} · ${m.soundVolumeTip()}`}
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
