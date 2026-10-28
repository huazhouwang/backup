import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import { Button } from '@lullabo/ui/button'
import { SegmentedControl } from '@lullabo/ui/segmented-control'
import { Sheet } from '@lullabo/ui/sheet'
import { cn } from '@lullabo/ui/utils'
import { useId, useState } from 'react'

import { MusicIcon } from '../../components/icons/MusicIcon'
import { createStoredValue, jsonCodec, useStore } from '../../lib/store'
import { m } from '../../paraglide/messages.js'
import { playSound, stopSound, useSoundPlaying } from './player'
import {
  SOUNDS,
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

/**
 * Soothing sounds for a sleep, on its timer card: a button that picks one, then what plays
 * and for how much longer, with stop. It stops when the sleep ends (SoundKeeper).
 */
export function SleepSound({ sleepId, now }: { sleepId: string; now: number }) {
  const playing = useSoundPlaying()
  const [picking, setPicking] = useState(false)
  const mine = playing?.sleepId === sleepId ? playing : null

  const status = !mine
    ? ''
    : mine.paused
      ? m.soundPaused()
      : mine.ending
        ? m.soundEnding()
        : mine.endsAt === null
          ? m.soundUntilStopped()
          : m.soundLeft({ minutes: Math.max(1, Math.ceil((mine.endsAt - now) / 60_000)) })

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
              <span className="text-caption text-muted-foreground">{status}</span>
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
      <SoundSheet sleepId={sleepId} open={picking} onClose={() => setPicking(false)} />
    </>
  )
}

function SoundSheet({
  sleepId,
  open,
  onClose,
}: {
  sleepId: string
  open: boolean
  onClose: () => void
}) {
  const saved = useStore(lastChoice)
  const [choice, setChoice] = useState(saved)
  const legendId = useId()

  function play() {
    lastChoice.set(choice)
    // Within the tap: browsers only start sound a person asked for.
    playSound(choice.sound, choice.minutes, sleepId)
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={m.soundTitle()}>
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend id={legendId} className="mb-1.5 p-0 font-bold">
          {m.soundPick()}
        </legend>
        <RadioGroup
          aria-labelledby={legendId}
          value={choice.sound}
          onValueChange={(sound) => {
            if (isSoundId(sound)) setChoice({ ...choice, sound })
          }}
          className="grid grid-cols-2 gap-2"
        >
          {SOUNDS.map((sound) => {
            const checked = choice.sound === sound.id
            return (
              <Radio.Root
                key={sound.id}
                value={sound.id}
                className={cn(
                  'press flex min-h-touch items-center justify-center rounded-lg border-2 border-b-4 px-2 text-center font-extrabold',
                  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-diaper',
                  checked
                    ? 'border-sleep bg-sleep-soft text-sleep-text'
                    : 'border-border bg-muted text-muted-foreground',
                )}
              >
                {sound.title()}
              </Radio.Root>
            )
          })}
        </RadioGroup>
      </fieldset>
      <SegmentedControl
        label={m.soundTimer()}
        labelStyle="field"
        options={TIMER_MINUTES.map((minutes) => ({
          value: timerKey(minutes),
          label: timerLabel(minutes),
        }))}
        value={timerKey(choice.minutes)}
        onChange={(key) =>
          setChoice({
            ...choice,
            minutes: TIMER_MINUTES.find((minutes) => timerKey(minutes) === key) ?? null,
          })
        }
      />
      <p className="m-0 text-caption text-muted-foreground">{m.soundVolumeTip()}</p>
      <Button tone="sleep" size="lg" block onClick={play}>
        {m.soundPlay()}
      </Button>
    </Sheet>
  )
}
