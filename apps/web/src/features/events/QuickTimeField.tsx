import { MINUTE } from '@lullabo/shared'
import { ChipGroup } from '@lullabo/ui/toggle-chip'
import { useState } from 'react'

import { m } from '../../paraglide/messages.js'
import { fromDateTimeLocal, toDateTimeLocal } from './time'
import { TimeRow } from './TimeRow'

/** One-tap "how long ago" choices, in minutes; 0 is "just now". */
const AGO = [0, 5, 15, 30, 60, 120] as const

const agoLabel = (minutes: number) =>
  minutes === 0
    ? m.timeJustNow()
    : minutes < 60
      ? m.timeMinutesAgo({ minutes })
      : m.timeHoursAgo({ hours: minutes / 60 })

/** "刚刚 / 5 分钟前 / …" choices; `selected` is null when none applies. */
export function AgoChips({
  legend,
  showLegend = false,
  options = AGO,
  selected,
  onSelect,
}: {
  legend: string
  showLegend?: boolean
  /** Minutes ago to offer; 0 is "just now". */
  options?: readonly number[]
  selected: number | null
  onSelect: (minutes: number) => void
}) {
  return (
    <ChipGroup<number>
      legend={legend}
      showLegend={showLegend}
      options={options}
      value={selected}
      onChange={onSelect}
      optionLabel={agoLabel}
    />
  )
}

/** A time field with "刚刚 / 5 分钟前 / …" shortcuts for logging after the fact. */
export function QuickTimeField({
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
  const [selected, setSelected] = useState<number | null>(0)
  return (
    <div className="flex flex-col gap-2">
      <TimeRow
        label={label}
        at={Number.isNaN(fromDateTimeLocal(value)) ? null : fromDateTimeLocal(value)}
        onChange={(at) => {
          setSelected(null)
          onChange(toDateTimeLocal(at))
        }}
        error={error}
        now={now}
      />
      <AgoChips
        legend={m.timeShortcuts()}
        selected={selected}
        onSelect={(minutes) => {
          setSelected(minutes)
          onChange(toDateTimeLocal(Date.now() - minutes * MINUTE))
        }}
      />
    </div>
  )
}
