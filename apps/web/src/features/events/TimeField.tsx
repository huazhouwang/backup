import { Input } from '@lullabo/ui/input'

import { toDateTimeLocal } from './time'

export function TimeField({
  label,
  value,
  onChange,
  error,
  now,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  now: number
}) {
  return (
    <Input
      label={label}
      type="datetime-local"
      max={toDateTimeLocal(now)}
      value={value}
      error={error}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}
