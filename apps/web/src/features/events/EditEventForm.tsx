import {
  type Event,
  MINUTE,
  breastSideDurations,
  eventDurationMs,
  hasKnownDuration,
  isRunning,
  recordKind,
} from '@lullabo/shared'
import { Button } from '@lullabo/ui/button'
import { FormError } from '@lullabo/ui/form-error'
import { Input } from '@lullabo/ui/input'
import { SegmentedControl } from '@lullabo/ui/segmented-control'
import { type FormEvent, useReducer, useState } from 'react'

import { useLocalStore } from '../../db'
import { useNow } from '../../lib/use-now'
import { m } from '../../paraglide/messages.js'
import { useAccess } from '../../sync/use-access'
import { useMemberName } from '../family/collections'
import { saveEvent } from './actions'
import { durationLabel } from './duration-label'
import {
  type DurationTimes,
  checkTimes,
  resolveTimes,
  sameTimes,
  storedTimes,
  timesReducer,
} from './duration-times'
import { DurationTimesFields } from './DurationTimes'
import { type DraftErrors, draftsFrom, withDrafts } from './fields/drafts'
import { RecordFields } from './fields/RecordFields'
import { DURATION_LOOK, type DurationKind, durationTone, isDurationKind } from './kinds'
import { optionsOf, sleepKindLabel } from './labels'
import { deleteEvent, moveEventStart, setBreastSides, setEventNote, stopEvent } from './records'
import { TimeRow } from './TimeRow'
import { clashingSleep, sleepOverlapMessage } from './validation'

type Errors = Partial<Record<'start' | 'end' | 'duration' | 'note' | 'form', string>> & DraftErrors

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
  const [drafts, setDrafts] = useState(() => draftsFrom(event))
  const [sleepKind, setSleepKind] = useState(() =>
    event.type === 'sleep' ? event.data.kind : 'nap',
  )
  const [errors, setErrors] = useState<Errors>({})

  /** The record with this form's start (and, when finished, duration and end), or errors. */
  function timed(current: number): { event: Event } | { errors: Errors } {
    if (!durationKind || running) {
      if (start > current + MINUTE) return { errors: { start: m.timeInFuture() } }
      return { event: moveEventStart(event, Math.min(start, current), current) }
    }
    // Untouched: the form shows whole minutes, the record keeps its own times.
    if (sameTimes(times, initialTimes)) return { event }
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
    const parsed = withDrafts(next, drafts)
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
    const parsed = withDrafts(event, drafts)
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
        <p className="m-0 text-caption text-muted-foreground">{m.eventAuthor({ name: author })}</p>
      )}
      {readOnly && <p className="m-0 font-bold text-muted-foreground">{m.eventReadOnly()}</p>}
      <fieldset disabled={readOnly} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
        <RecordFields kind={kind} drafts={drafts} onChange={setDrafts} errors={errors} editing />
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
            <p className="m-0 text-muted-foreground">
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
          <Button variant="ghost" tone="destructive" onClick={remove}>
            {m.eventDelete()}
          </Button>
        </>
      )}
    </form>
  )
}
