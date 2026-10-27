import {
  type Event,
  MINUTE,
  breastSideDurations,
  eventDurationMs,
  hasKnownDuration,
  isRunning,
  recordKind,
} from '@lullabo/shared'
import { type FormEvent, useReducer, useState } from 'react'

import { Button } from '../../components/ui/Button'
import { FormError } from '../../components/ui/FormError'
import { Input } from '../../components/ui/Input'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { useLocalStore } from '../../db'
import { inputValue } from '../../lib/units'
import { useNow } from '../../lib/use-now'
import { m } from '../../paraglide/messages.js'
import { useAccess } from '../../sync/use-access'
import { useMemberName } from '../family/collections'
import {
  type GrowthErrors,
  draftFromGrowth,
  emptyGrowth,
  parseGrowth,
} from '../growth/growth-input'
import { saveEvent } from './actions'
import { type DiaperData, DiaperFields } from './DiaperFields'
import { durationLabel } from './duration-label'
import {
  type DurationTimes,
  checkTimes,
  resolveTimes,
  storedTimes,
  timesReducer,
} from './duration-times'
import { DurationTimesFields } from './DurationTimes'
import {
  draftFromBottle,
  draftFromMedication,
  draftFromPumping,
  emptyBottle,
  emptyMedication,
  emptyPumping,
  parseBottleDraft,
  parseCelsius,
  parseMedication,
  parsePumping,
  parseSolids,
} from './event-draft'
import {
  BottleFields,
  GrowthFields,
  MedicationFields,
  PumpingFields,
  SolidsField,
  TemperatureField,
} from './EventFields'
import { DURATION_LOOK, type DurationKind, durationTone, isDurationKind } from './kinds'
import { optionsOf, sleepKindLabel } from './labels'
import { deleteEvent, moveEventStart, setBreastSides, setEventNote, stopEvent } from './records'
import { TimeRow } from './TimeRow'
import { clashingSleep, sleepOverlapMessage } from './validation'

type Errors = Partial<
  Record<
    'start' | 'end' | 'duration' | 'amount' | 'food' | 'celsius' | 'name' | 'note' | 'form',
    string
  >
> &
  GrowthErrors

/** A record's start, duration and end as the edit sheet holds them (duration-times.ts). */
function timesOf(event: Event, kind: DurationKind): DurationTimes {
  const breast = event.type === 'feeding' && event.data.kind === 'breast' ? event.data : null
  return storedTimes(
    kind,
    event.startAt,
    hasKnownDuration(event) ? eventDurationMs(event, event.startAt) : null,
    breast && event.endAt !== null ? breastSideDurations(breast.segments, event.endAt) : null,
    breast?.segments[0]?.side ?? 'left',
  )
}

/** Edits any event; changes are applied through the pure helpers in records.ts. */
export function EditEventForm({
  event,
  events,
  onDone,
  onDeleted,
}: {
  event: Event
  events: readonly Event[]
  onDone: () => void
  onDeleted?: (event: Event) => void
}) {
  const store = useLocalStore()
  const now = useNow(60_000)
  const readOnly = !useAccess().canEditEvent(event)
  const author = useMemberName(event.familyId, event.createdBy)
  const running = isRunning(event)
  const kind = recordKind(event)
  const durationKind = isDurationKind(kind) ? kind : null
  // Instant and running records: when it happened or started.
  const [start, setStart] = useState(event.startAt)
  // Finished duration records: start, duration and end together (duration-times.ts).
  const [initialTimes] = useState(() => timesOf(event, durationKind ?? 'sleep'))
  const [times, dispatch] = useReducer(timesReducer, initialTimes)
  const [note, setNote] = useState(event.note ?? '')
  const [bottle, setBottle] = useState(() =>
    event.type === 'feeding' && event.data.kind === 'bottle'
      ? draftFromBottle(event.data)
      : emptyBottle,
  )
  const [food, setFood] = useState(() =>
    event.type === 'feeding' && event.data.kind === 'solids' ? event.data.food : '',
  )
  const [pumping, setPumping] = useState(() =>
    event.type === 'pumping' ? draftFromPumping(event.data) : emptyPumping,
  )
  const [celsius, setCelsius] = useState(() =>
    event.type === 'temperature' ? inputValue('temperature', event.data.celsius) : '',
  )
  const [medication, setMedication] = useState(() =>
    event.type === 'medication' ? draftFromMedication(event.data) : emptyMedication,
  )
  const [growth, setGrowth] = useState(() =>
    event.type === 'growth' ? draftFromGrowth(event.data) : emptyGrowth,
  )
  const [diaper, setDiaper] = useState<DiaperData>(() =>
    event.type === 'diaper' ? event.data : { contents: 'wet' },
  )
  const [sleepKind, setSleepKind] = useState(() =>
    event.type === 'sleep' ? event.data.kind : 'nap',
  )
  const [errors, setErrors] = useState<Errors>({})

  /** The edited record with this form's values, or the field errors. */
  function parseData(current: Event): { event: Event } | { errors: Errors } {
    const result = <D,>(parsed: { data: D } | { errors: Errors }, apply: (data: D) => Event) =>
      'errors' in parsed ? parsed : { event: apply(parsed.data) }
    switch (current.type) {
      case 'feeding':
        if (current.data.kind === 'bottle') {
          return result(parseBottleDraft(bottle, true), (data) => ({ ...current, data }))
        }
        if (current.data.kind === 'solids') {
          return result(parseSolids(food), (data) => ({ ...current, data }))
        }
        return { event: current }
      case 'diaper':
        return { event: { ...current, data: diaper } }
      case 'pumping':
        // A running pumping may not have an amount yet.
        if (current.endAt === null && !pumping.amount.trim()) {
          return { event: { ...current, data: { side: pumping.side } } }
        }
        return result(parsePumping(pumping), (data) => ({ ...current, data }))
      case 'temperature':
        return result(parseCelsius(celsius), (data) => ({ ...current, data }))
      case 'medication':
        return result(parseMedication(medication), (data) => ({ ...current, data }))
      case 'growth':
        return result(parseGrowth(growth), (data) => ({ ...current, data }))
      default:
        return { event: current }
    }
  }

  /** The record with this form's start (and, when finished, duration and end), or errors. */
  function timed(current: number): { event: Event } | { errors: Errors } {
    if (!durationKind || running) {
      if (start > current + MINUTE) return { errors: { start: m.timeInFuture() } }
      return { event: moveEventStart(event, Math.min(start, current), current) }
    }
    // Sleeps and breastfeeds always have a length; bottles, solids and pumping may not.
    const timeErrors = checkTimes(
      times,
      current,
      durationKind === 'sleep' || durationKind === 'breast',
    )
    if (Object.keys(timeErrors).length > 0) return { errors: timeErrors }
    const resolved = resolveTimes(times, current)
    const moved = moveEventStart(event, resolved.startAt, current)
    const endAt = resolved.endAt ?? moved.startAt
    const sidesChanged =
      times.sides.left !== initialTimes.sides.left || times.sides.right !== initialTimes.sides.right
    if (moved.type === 'feeding' && moved.data.kind === 'breast') {
      // Unchanged sides keep the recorded switches; new ones become one stretch per side.
      const sides = {
        left: (times.sides.left ?? 0) * MINUTE,
        right: (times.sides.right ?? 0) * MINUTE,
      }
      return { event: sidesChanged ? setBreastSides(moved, sides, current) : moved }
    }
    return { event: { ...moved, endAt } }
  }

  function submit(formEvent: FormEvent) {
    formEvent.preventDefault()
    if (readOnly) return
    const current = Date.now()
    const nextErrors: Errors = {}
    const timing = timed(current)
    let next: Event = event
    if ('errors' in timing) Object.assign(nextErrors, timing.errors)
    else next = timing.event
    if (next.type === 'sleep') {
      next = { ...next, data: { kind: sleepKind } }
      const clash = clashingSleep(events, next.startAt, next.endAt ?? current, current, next.id)
      if (clash) nextErrors.form = sleepOverlapMessage(clash, current)
    }
    const parsed = parseData(next)
    if ('errors' in parsed) Object.assign(nextErrors, parsed.errors)
    else next = parsed.event
    if (next.type === 'note' && !note.trim()) nextErrors.note = m.noteRequired()

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    saveEvent(store, setEventNote(next, note, current))
    onDone()
  }

  /** Stops a running record from here, with this form's other changes. */
  function stopNow() {
    const current = Date.now()
    const parsed = parseData(event)
    if ('errors' in parsed) {
      setErrors(parsed.errors)
      return
    }
    if (parsed.event.type === 'pumping' && parsed.event.data.amountMl === undefined) {
      setErrors({ amount: m.pumpingAmountToStop() })
      return
    }
    saveEvent(store, setEventNote(stopEvent(parsed.event, current), note, current))
    onDone()
  }

  function remove() {
    const deleted = deleteEvent(event, Date.now())
    saveEvent(store, deleted)
    onDeleted?.(deleted)
    onDone()
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {author && (
        <p className="m-0 text-caption text-fg-muted">{m.eventAuthor({ name: author })}</p>
      )}
      {readOnly && <p className="m-0 font-bold text-fg-muted">{m.eventReadOnly()}</p>}
      <fieldset disabled={readOnly} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
        {event.type === 'feeding' && event.data.kind === 'bottle' && (
          <BottleFields value={bottle} onChange={setBottle} error={errors.amount} editing />
        )}
        {event.type === 'feeding' && event.data.kind === 'solids' && (
          <SolidsField value={food} onChange={setFood} error={errors.food} />
        )}
        {event.type === 'diaper' && <DiaperFields value={diaper} onChange={setDiaper} />}
        {event.type === 'pumping' && (
          <PumpingFields value={pumping} onChange={setPumping} error={errors.amount} />
        )}
        {event.type === 'growth' && (
          <GrowthFields value={growth} onChange={setGrowth} errors={errors} />
        )}
        {event.type === 'temperature' && (
          <TemperatureField value={celsius} onChange={setCelsius} error={errors.celsius} />
        )}
        {event.type === 'medication' && (
          <MedicationFields value={medication} onChange={setMedication} error={errors.name} />
        )}
        {event.type === 'sleep' && (
          <SegmentedControl
            label={m.sleepKindLabel()}
            options={optionsOf(sleepKindLabel, ['nap', 'night'])}
            value={sleepKind}
            onChange={setSleepKind}
          />
        )}
        {durationKind && !running ? (
          <DurationTimesFields times={times} dispatch={dispatch} now={now} errors={errors} />
        ) : (
          <TimeRow
            label={durationKind ? m.eventStart() : m.eventTime()}
            at={start}
            onChange={setStart}
            error={errors.start}
            now={now}
          />
        )}
        {durationKind && running && (
          <div className="flex items-center justify-between gap-3">
            <p className="m-0 text-fg-muted">
              {m.eventRunningFor({ duration: durationLabel(eventDurationMs(event, now)) })}
            </p>
            <Button tone={durationTone(durationKind)} onClick={stopNow}>
              {DURATION_LOOK[durationKind].stop()}
            </Button>
          </div>
        )}
        <Input
          label={event.type === 'note' ? m.noteText() : m.eventNote()}
          placeholder={event.type === 'note' ? undefined : m.eventNotePlaceholder()}
          error={errors.note}
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
        />
      </fieldset>
      {errors.form && <FormError>{errors.form}</FormError>}
      {!readOnly && (
        <>
          <Button type="submit" size="lg" block>
            {m.actionSave()}
          </Button>
          <Button variant="ghost" tone="danger" onClick={remove}>
            {m.eventDelete()}
          </Button>
        </>
      )}
    </form>
  )
}
