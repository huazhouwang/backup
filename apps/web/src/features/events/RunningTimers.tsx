import { type Event, breastSideDurations, isRunning, recordKind } from '@lullabo/shared'
import { Bun } from '@lullabo/ui/bun'
import { Button } from '@lullabo/ui/button'
import { Card, type CardTone } from '@lullabo/ui/card'
import { Input } from '@lullabo/ui/input'
import { growInOut } from '@lullabo/ui/motion'
import { Sheet } from '@lullabo/ui/sheet'
import { cn } from '@lullabo/ui/utils'
import { AnimatePresence, m as motion } from 'motion/react'
import { type FormEvent, useState } from 'react'

import { useLocalStore } from '../../db'
import { formatTime } from '../../lib/i18n'
import { quantityInputProps, unitLabel } from '../../lib/units'
import { useNow } from '../../lib/use-now'
import { m } from '../../paraglide/messages.js'
import { useAccess } from '../../sync/use-access'
import { saveEvent } from './actions'
import { EventIcon, eventIconProps } from './EventIcon'
import { parseVolume } from './fields/measure-input'
import { type DurationKind, DURATION_LOOK, durationTone, isDurationKind } from './kinds'
import { sideLabel } from './labels'
import { currentBreastSide, stopEvent, switchBreastSide } from './records'
import { formatClock } from './time'

/** Space under each timer card, matching the page's gap-6 (cancelled by the list's -mb-6). */
const TIMER_GAP = 24

const CARD_TONE: Record<DurationKind, CardTone> = {
  breast: 'feeding',
  bottle: 'feeding',
  solids: 'feeding',
  sleep: 'sleep',
  pumping: 'pumping',
}

const TITLE_TONE: Record<DurationKind, string> = {
  breast: 'text-feeding-text',
  bottle: 'text-feeding-text',
  solids: 'text-feeding-text',
  sleep: 'text-sleep-text',
  pumping: 'text-pumping-text',
}

function title(event: Event, kind: DurationKind): string {
  if (event.type === 'feeding' && event.data.kind === 'breast') {
    return m.timerCurrentSide({ side: sideLabel[currentBreastSide(event) ?? 'left']() })
  }
  if (event.type === 'pumping') {
    return m.timerWithSide({
      title: DURATION_LOOK.pumping.running(),
      side: sideLabel[event.data.side](),
    })
  }
  return DURATION_LOOK[kind].running()
}

/** Asks for what is only known at the end (how much was pumped) before stopping. */
function FinishPumping({
  event,
  onClose,
}: {
  event: Extract<Event, { type: 'pumping' }> | null
  onClose: () => void
}) {
  const store = useLocalStore()
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string>()

  function submit(formEvent: FormEvent) {
    formEvent.preventDefault()
    if (!event) return
    const volume = parseVolume(amount)
    if ('error' in volume) {
      setError(volume.error)
      return
    }
    const stopped = stopEvent(event, Date.now())
    saveEvent(store, { ...stopped, data: { ...stopped.data, amountMl: volume.amountMl } })
    setAmount('')
    onClose()
  }

  return (
    <Sheet open={event !== null} onClose={onClose} title={m.pumpingFinishTitle()}>
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <Input
          label={m.pumpingAmount({ unit: unitLabel('volume') })}
          {...quantityInputProps('volume')}
          min={0}
          value={amount}
          error={error}
          onChange={(change) => setAmount(change.target.value)}
        />
        <Button type="submit" tone="pumping" size="lg" block>
          {m.timerStop()}
        </Button>
      </form>
    </Sheet>
  )
}

/** One running record: what it is, since when, the elapsed time, and stopping it. */
function TimerCard({
  event,
  now,
  onFinishPumping,
}: {
  event: Event
  now: number
  onFinishPumping: (event: Extract<Event, { type: 'pumping' }>) => void
}) {
  const store = useLocalStore()
  const canEdit = useAccess().canEditEvent(event)
  const kind = recordKind(event)
  const breast = event.type === 'feeding' && event.data.kind === 'breast' ? event : null
  const side = breast ? (currentBreastSide(breast) ?? 'left') : undefined
  const totals =
    breast?.data.kind === 'breast' ? breastSideDurations(breast.data.segments, now) : null

  // Only duration records run.
  if (!isDurationKind(kind)) return null
  const look = DURATION_LOOK[kind]

  function stop() {
    if (event.type === 'pumping' && event.data.amountMl === undefined) onFinishPumping(event)
    else saveEvent(store, stopEvent(event, Date.now()))
  }

  return (
    <Card tone={CARD_TONE[kind]} className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {/* A sleeping baby: the bun sleeps along. */}
        {kind === 'sleep' ? (
          <Bun mood="asleep" className="size-10" />
        ) : (
          <EventIcon {...eventIconProps(event)} className="size-10" />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className={cn('truncate font-extrabold', TITLE_TONE[kind])}>
            {title(event, kind)}
          </span>
          <span className="text-caption text-muted-foreground">
            {m.timerStartedAt({ time: formatTime(event.startAt) })}
          </span>
        </div>
        <span className="text-display font-extrabold tabular-nums" role="timer">
          {formatClock(now - event.startAt)}
        </span>
      </div>
      {totals && (
        <div className="grid grid-cols-2 gap-2 text-center">
          {(['left', 'right'] as const).map((s) => (
            <div
              key={s}
              className={cn(
                'rounded-lg border-2 py-1',
                s === side
                  ? 'border-feeding bg-background font-extrabold'
                  : 'border-transparent text-muted-foreground',
              )}
            >
              <div className="text-caption">{sideLabel[s]()}</div>
              <div className="tabular-nums">{formatClock(totals[s])}</div>
            </div>
          ))}
        </div>
      )}
      {canEdit && (
        <div className={cn('grid gap-3', breast ? 'grid-cols-2' : 'grid-cols-1')}>
          {breast && (
            <Button
              variant="outline"
              tone="feeding"
              onClick={() => saveEvent(store, switchBreastSide(breast, Date.now()))}
            >
              {m.timerSwitchSide({ side: sideLabel[side === 'left' ? 'right' : 'left']() })}
            </Button>
          )}
          <Button tone={durationTone(kind)} onClick={stop}>
            {look.stop()}
          </Button>
        </div>
      )}
    </Card>
  )
}

/** Live cards for the selected baby's running timers, derived from stored timestamps. */
export function RunningTimers({ events }: { events: readonly Event[] }) {
  const running = events.filter(isRunning)
  const now = useNow(1000, running.length > 0)
  const [finishing, setFinishing] = useState<Extract<Event, { type: 'pumping' }> | null>(null)

  // Each card carries its own spacing (cancelled by the list's negative margin), so a card
  // growing in or shrinking away moves the page smoothly; the empty list takes no room.
  return (
    <>
      <div className="-mb-6 flex flex-col empty:hidden">
        <AnimatePresence initial={false}>
          {running.map((event) => (
            <motion.div key={event.id} {...growInOut(TIMER_GAP)} className="overflow-hidden">
              <TimerCard event={event} now={now} onFinishPumping={setFinishing} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <FinishPumping event={finishing} onClose={() => setFinishing(null)} />
    </>
  )
}
