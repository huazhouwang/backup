import type { Event } from '@lullabo/shared'
import { Button } from '@lullabo/ui/button'
import { FormError } from '@lullabo/ui/form-error'
import { Input } from '@lullabo/ui/input'
import { type FormEvent, useState } from 'react'

import { useLocalStore } from '../../db'
import { useNow } from '../../lib/use-now'
import { m } from '../../paraglide/messages.js'
import { addEvent } from './actions'
import { CATEGORY_LOOK, type InstantCategory } from './category'
import { type DraftErrors, emptyDrafts, parseCelsius, parseMedication } from './fields/drafts'
import { parseGrowth } from './fields/growth-input'
import { RecordFields } from './fields/RecordFields'
import { QuickTimeField } from './QuickTimeField'
import { logGrowth, logMedication, logNote, logTemperature } from './records'
import { toDateTimeLocal } from './time'
import { validateTime } from './validation'

type Errors = Partial<Record<'time' | 'text', string>> & DraftErrors

/** Form for the less frequent instant records (temperature, medication, notes, growth). */
export function OtherEventForm({
  category,
  babyIds,
  onDone,
}: {
  category: InstantCategory
  babyIds: readonly string[]
  onDone: () => void
}) {
  const store = useLocalStore()
  const now = useNow(60_000)
  const [time, setTime] = useState(() => toDateTimeLocal(now))
  const [drafts, setDrafts] = useState(emptyDrafts)
  const [text, setText] = useState('')
  const [errors, setErrors] = useState<Errors>({})

  /** The record for one baby, or the field errors that block saving. */
  function build(at: number, current: number): ((babyId: string) => Event) | Errors {
    switch (category) {
      case 'temperature': {
        const parsed = parseCelsius(drafts.celsius)
        return 'errors' in parsed
          ? parsed.errors
          : (id) => logTemperature(id, at, parsed.data.celsius, current)
      }
      case 'medication': {
        const parsed = parseMedication(drafts.medication)
        return 'errors' in parsed
          ? parsed.errors
          : (id) => logMedication(id, at, parsed.data.name, parsed.data.dose ?? '', current)
      }
      case 'growth': {
        const parsed = parseGrowth(drafts.growth)
        return 'errors' in parsed ? parsed.errors : (id) => logGrowth(id, at, parsed.data, current)
      }
      case 'note':
        return text.trim() ? (id) => logNote(id, at, text, current) : { text: m.noteRequired() }
      default:
        return category satisfies never
    }
  }

  function submit(formEvent: FormEvent) {
    formEvent.preventDefault()
    const current = Date.now()
    const timeResult = validateTime(time, current)
    const record = build('at' in timeResult ? timeResult.at : current, current)
    const next: Errors = typeof record === 'function' ? {} : record
    if ('error' in timeResult) next.time = timeResult.error
    setErrors(next)
    if (typeof record !== 'function' || Object.keys(next).length > 0) return
    for (const babyId of babyIds) addEvent(store, record(babyId))
    onDone()
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <RecordFields kind={category} drafts={drafts} onChange={setDrafts} errors={errors} />
      {errors.form && <FormError>{errors.form}</FormError>}
      {category === 'note' && (
        <Input
          label={m.noteText()}
          value={text}
          maxLength={500}
          error={errors.text}
          onChange={(e) => setText(e.target.value)}
        />
      )}
      <QuickTimeField
        label={m.eventTime()}
        value={time}
        onChange={setTime}
        error={errors.time}
        now={now}
      />
      <Button type="submit" tone={CATEGORY_LOOK[category].tone} size="lg" block>
        {m.actionLog()}
      </Button>
    </form>
  )
}
