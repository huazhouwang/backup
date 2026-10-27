import type { Event } from '@lullabo/shared'
import { type FormEvent, useState } from 'react'

import { Button } from '../../components/ui/Button'
import { FormError } from '../../components/ui/FormError'
import { Input } from '../../components/ui/Input'
import { useLocalStore } from '../../db'
import { useNow } from '../../lib/use-now'
import { m } from '../../paraglide/messages.js'
import { type GrowthErrors, emptyGrowth, parseGrowth } from '../growth/growth-input'
import { addEvent } from './actions'
import { type InstantCategory, categoryTone } from './category'
import { emptyMedication, parseCelsius, parseMedication } from './event-draft'
import { GrowthFields, MedicationFields, TemperatureField } from './EventFields'
import { QuickTimeField } from './QuickTimeField'
import { logGrowth, logMedication, logNote, logTemperature } from './records'
import { toDateTimeLocal } from './time'
import { validateTime } from './validation'

type Errors = Partial<Record<'time' | 'amount' | 'celsius' | 'name' | 'text', string>> &
  GrowthErrors

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
  const [celsius, setCelsius] = useState('')
  const [medication, setMedication] = useState(emptyMedication)
  const [text, setText] = useState('')
  const [growth, setGrowth] = useState(emptyGrowth)
  const [errors, setErrors] = useState<Errors>({})

  /** The record for one baby, or the field errors that block saving. */
  function build(at: number, current: number): ((babyId: string) => Event) | Errors {
    switch (category) {
      case 'temperature': {
        const parsed = parseCelsius(celsius)
        return 'errors' in parsed
          ? parsed.errors
          : (id) => logTemperature(id, at, parsed.data.celsius, current)
      }
      case 'medication': {
        const parsed = parseMedication(medication)
        return 'errors' in parsed
          ? parsed.errors
          : (id) => logMedication(id, at, parsed.data.name, parsed.data.dose ?? '', current)
      }
      case 'growth': {
        const parsed = parseGrowth(growth)
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
      {category === 'growth' && (
        <>
          <GrowthFields value={growth} onChange={setGrowth} errors={errors} />
          {errors.form && <FormError>{errors.form}</FormError>}
        </>
      )}
      {category === 'temperature' && (
        <TemperatureField value={celsius} onChange={setCelsius} error={errors.celsius} />
      )}
      {category === 'medication' && (
        <MedicationFields value={medication} onChange={setMedication} error={errors.name} />
      )}
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
      <Button type="submit" tone={categoryTone[category]} size="lg" block>
        {m.actionLog()}
      </Button>
    </form>
  )
}
