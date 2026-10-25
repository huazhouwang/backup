import {
  type BreastSide,
  type Event,
  type FeedingEvent,
  MINUTE,
  RECORD_KINDS,
  isRunning,
  recordKind,
} from '@bobo/shared'
import { type FormEvent, type ReactNode, useReducer, useState } from 'react'

import { Button } from '../../components/ui/Button'
import { FormError } from '../../components/ui/FormError'
import { Input } from '../../components/ui/Input'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { useLocalStore } from '../../db'
import { quantityInputProps, unitLabel } from '../../lib/units'
import { useNow } from '../../lib/use-now'
import { m } from '../../paraglide/messages.js'
import { addEvent } from './actions'
import { checkTimes, newTimes, resolveTimes, timesReducer } from './duration-times'
import { DurationTimesFields } from './DurationTimes'
import { emptyBottle, parseBottleDraft, parseSolids } from './event-draft'
import { BottleFields, SolidsField } from './EventFields'
import { type DurationKind, durationTone } from './kinds'
import { optionsOf, sideLabel } from './labels'
import { parseVolume } from './measure-input'
import { type DurationDetails, logRecord, startRecord, suggestedBreastSide } from './records'
import { useEventsByBaby } from './use-events'
import { overlapsSleep } from './validation'

type Errors = Partial<Record<'amount' | 'food' | 'start' | 'end' | 'duration' | 'form', string>>
type PumpingSide = 'left' | 'right' | 'both'

const runningOf = (events: readonly Event[], kind: DurationKind) =>
  events.some((event) => isRunning(event) && recordKind(event) === kind)

/**
 * Logs a duration record (breastfeeding, bottle, solids, sleep, pumping): its details, then
 * either a timer started now or a record logged afterwards with when it started and how long
 * it took. Everything kind-specific comes from RECORD_KINDS and DURATION_LOOK.
 */
export function DurationForm({
  kind,
  babyIds,
  events,
  targets,
  onDone,
}: {
  kind: DurationKind
  /** The selected baby first, then any logged together with it. */
  babyIds: readonly string[]
  /** Events of the selected baby. */
  events: readonly Event[]
  targets?: ReactNode
  onDone: () => void
}) {
  const store = useLocalStore()
  const eventsByBaby = useEventsByBaby(babyIds)
  const definition = RECORD_KINDS[kind]
  // Time the sheet opened; the defaults and the latest selectable time derive from it.
  const now = useNow(60_000)

  const lastBreast = events.find(
    (event): event is FeedingEvent => event.type === 'feeding' && event.data.kind === 'breast',
  )
  const [pumpingSide, setPumpingSide] = useState<PumpingSide>('both')
  const [bottle, setBottle] = useState(emptyBottle)
  const [food, setFood] = useState('')
  const [amount, setAmount] = useState('')

  // Logging afterwards: the usual duration, just ended, until changed (duration-times.ts).
  const [times, dispatch] = useReducer(timesReducer, null, () =>
    newTimes(kind, definition.usualMinutes, suggestedBreastSide(lastBreast)),
  )
  // The side a breastfeed starts on, timed or logged afterwards.
  const breastSide = times.firstSide
  const [errors, setErrors] = useState<Errors>({})

  const running = runningOf(events, kind)

  /** The details for one record, or the errors that block it. */
  function details(afterwards: boolean): DurationDetails | Errors {
    switch (kind) {
      case 'breast':
        return {
          kind,
          side: breastSide,
          ...(afterwards && {
            sides: {
              left: (times.sides.left ?? 0) * MINUTE,
              right: (times.sides.right ?? 0) * MINUTE,
            },
          }),
        }
      case 'bottle': {
        const parsed = parseBottleDraft(bottle)
        return 'errors' in parsed ? parsed.errors : parsed.data
      }
      case 'solids': {
        const parsed = parseSolids(food)
        return 'errors' in parsed ? parsed.errors : parsed.data
      }
      case 'sleep':
        return { kind }
      case 'pumping': {
        // The amount is known at the end: asked when logging afterwards or stopping.
        if (!afterwards) return { kind, side: pumpingSide }
        const volume = parseVolume(amount)
        return 'error' in volume
          ? { amount: volume.error }
          : { kind, side: pumpingSide, amountMl: volume.amountMl }
      }
      default:
        return kind satisfies never
    }
  }

  const eventsOf = (babyId: string) =>
    babyId === babyIds[0] ? events : (eventsByBaby.get(babyId) ?? [])

  function startNow() {
    const record = details(false)
    if (!('kind' in record)) {
      setErrors(record)
      return
    }
    const current = Date.now()
    for (const babyId of babyIds) {
      const theirs = eventsOf(babyId)
      // A baby logged together that already has this timer running keeps it.
      const busy =
        runningOf(theirs, kind) ||
        (kind === 'sleep' && overlapsSleep(theirs, current, current + 1, current))
      if (!busy) addEvent(store, startRecord(babyId, record, current))
    }
    onDone()
  }

  function logAfterwards(formEvent: FormEvent) {
    formEvent.preventDefault()
    const current = Date.now()
    const record = details(true)
    const next: Errors = {
      ...('kind' in record ? {} : record),
      ...checkTimes(times, current, true),
    }
    const { startAt: from, endAt } = resolveTimes(times, current)
    const to = endAt ?? from
    if (!next.start && !next.end && !next.duration) {
      if (kind === 'sleep') {
        const clash = babyIds.find((id) => overlapsSleep(eventsOf(id), from, to, current))
        if (clash === babyIds[0]) next.form = m.sleepOverlap()
        else if (clash) next.form = m.sleepOverlapFor({ name: store.babies.get(clash)?.name ?? '' })
      }
    }
    setErrors(next)
    if (Object.keys(next).length > 0 || !('kind' in record)) return
    for (const babyId of babyIds) addEvent(store, logRecord(babyId, record, from, to, current))
    onDone()
  }

  return (
    <div className="flex flex-col gap-4">
      {targets}
      {kind === 'breast' && (
        <SegmentedControl<BreastSide>
          label={m.breastFirstSide()}
          labelStyle="field"
          options={(['left', 'right'] as const).map((side) => ({
            value: side,
            label:
              side === suggestedBreastSide(lastBreast)
                ? m.sideWithSuggestion({ side: sideLabel[side]() })
                : sideLabel[side](),
          }))}
          value={breastSide}
          onChange={(side) => dispatch({ type: 'firstSide', side })}
        />
      )}
      {kind === 'pumping' && (
        <SegmentedControl<PumpingSide>
          label={m.pumpingSide()}
          labelStyle="field"
          options={optionsOf(sideLabel, definition.sides)}
          value={pumpingSide}
          onChange={setPumpingSide}
        />
      )}
      {kind === 'bottle' && (
        <BottleFields value={bottle} onChange={setBottle} error={errors.amount} />
      )}
      {kind === 'solids' && <SolidsField value={food} onChange={setFood} error={errors.food} />}

      {running ? (
        <p className="m-0 text-fg-muted">{m.durationAlreadyRunning()}</p>
      ) : (
        <Button tone={durationTone(kind)} size="lg" block className="min-h-16" onClick={startNow}>
          {kind === 'sleep' ? m.sleepStartNow() : m.durationStartTimer()}
        </Button>
      )}

      <form
        noValidate
        onSubmit={logAfterwards}
        className="flex flex-col gap-4 border-t-2 border-border pt-4"
      >
        <h3 className="m-0 font-extrabold">{m.durationAfterwards()}</h3>
        <DurationTimesFields times={times} dispatch={dispatch} now={now} errors={errors} quickEnd />
        {kind === 'pumping' && (
          <Input
            label={m.pumpingAmount({ unit: unitLabel('volume') })}
            {...quantityInputProps('volume')}
            min={0}
            value={amount}
            error={errors.amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        )}
        {errors.form && <FormError>{errors.form}</FormError>}
        <Button type="submit" variant="soft" tone={durationTone(kind)} block>
          {m.actionSave()}
        </Button>
      </form>
    </div>
  )
}
