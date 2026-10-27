import { MINUTE } from '@lullabo/shared'
import { useState } from 'react'

import { FormError } from '../../components/ui/FormError'
import { Input } from '../../components/ui/Input'
import { type ChipTone, ChipGroup } from '../../components/ui/ToggleChip'
import { m } from '../../paraglide/messages.js'
import { durationLabel } from './duration-label'

type Choice = number | 'custom'

/** Short enough for a chip: "20 分钟", "1.5 小时". */
function chipLabel(minutes: number): string {
  if (minutes < 60) return m.durationMinutes({ minutes })
  return minutes % 30 === 0
    ? m.durationHours({ hours: minutes / 60 })
    : durationLabel(minutes * MINUTE)
}

/**
 * How long something took: quick choices in minutes, or any number of minutes. With
 * `noneLabel`, a first choice of 0 for "not at all" (a breast side not fed).
 */
export function DurationField({
  legend,
  choices,
  value,
  onChange,
  noneLabel,
  tone,
  error,
}: {
  legend: string
  choices: readonly number[]
  value: number | null
  onChange: (minutes: number | null) => void
  noneLabel?: string
  tone?: ChipTone
  error?: string
}) {
  const quick = noneLabel === undefined ? choices : [0, ...choices]
  // "自定义" stays chosen while typing; a value set from outside that isn't a choice shows there too.
  const [customChosen, setCustomChosen] = useState(false)
  const custom = customChosen || (value !== null && !quick.includes(value))
  return (
    <div className="flex flex-col gap-2">
      <ChipGroup<Choice>
        legend={legend}
        options={[...quick, 'custom']}
        value={custom ? 'custom' : value}
        onChange={(choice) => {
          setCustomChosen(choice === 'custom')
          if (choice !== 'custom') onChange(choice)
        }}
        optionLabel={(choice) =>
          choice === 'custom'
            ? m.durationCustom()
            : choice === 0 && noneLabel !== undefined
              ? noneLabel
              : chipLabel(choice)
        }
        tone={tone}
      />
      {custom && (
        <Input
          label={m.durationCustomMinutes()}
          type="number"
          inputMode="numeric"
          min={1}
          max={24 * 60}
          value={value ?? ''}
          onChange={(event) => {
            const minutes = Number.parseInt(event.target.value, 10)
            onChange(minutes > 0 ? minutes : null)
          }}
        />
      )}
      {error && <FormError>{error}</FormError>}
    </div>
  )
}
