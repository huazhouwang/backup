import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import { Toggle } from '@base-ui/react/toggle'
import { type ButtonHTMLAttributes, useEffect, useId, useRef } from 'react'

import { useBounce } from '../lib/bounce'
import { popElement } from '../lib/motion'
import { cn } from '../lib/utils'

export type ChipTone = 'primary' | 'feeding' | 'diaper'

const pressedTones: Record<ChipTone, { box: string; text: string }> = {
  primary: { box: 'border-primary bg-accent', text: 'text-accent-foreground' },
  feeding: { box: 'border-feeding bg-feeding-soft', text: 'text-feeding-text' },
  diaper: { box: 'border-diaper bg-diaper-soft', text: 'text-diaper-text' },
}

export interface ToggleChipProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'value' | 'defaultValue'
> {
  pressed: boolean
  tone?: ChipTone
  /** Color the label by state (muted when off, the tone when on); off for picture cards. */
  tintText?: boolean
}

/** On/off button with the flat pressed edge, on Base UI's Toggle (`aria-pressed`). */
export function ToggleChip({
  pressed,
  tone = 'primary',
  tintText = true,
  type = 'button',
  className,
  onClick,
  ...props
}: ToggleChipProps) {
  return (
    <Toggle
      type={type}
      pressed={pressed}
      onClick={(event) => {
        if (!pressed) popElement(event.currentTarget)
        onClick?.(event)
      }}
      className={cn(
        'press border-2 border-b-4',
        pressed ? pressedTones[tone].box : 'border-border bg-muted',
        tintText && (pressed ? pressedTones[tone].text : 'text-muted-foreground'),
        className,
      )}
      {...props}
    />
  )
}

export interface ChipGroupProps<T> {
  legend: string
  /** Visually hidden legends still name the group for screen readers. */
  showLegend?: boolean
  options: readonly T[]
  value: T | null
  onChange: (value: T) => void
  optionLabel: (value: T) => string
  tone?: ChipTone
}

/**
 * Single-choice chips in one row that scrolls sideways, for quick picks like "5 分钟前". Each
 * chip is 28% of the row, so on any screen three fit and the next is cut off at the right
 * edge, showing there are more; on narrow rows the label shrinks to fit. Base UI's radio group
 * underneath gives the group its name, arrow keys and one tab stop.
 */
export function ChipGroup<T extends string | number | null>({
  legend,
  showLegend = true,
  options,
  value,
  onChange,
  optionLabel,
  tone = 'primary',
}: ChipGroupProps<T>) {
  const legendId = useId()
  const row = useRef<HTMLDivElement>(null)
  useBounce(row, { axes: ['x'] })
  // A choice made earlier (editing a record) may sit past the visible chips: show it.
  useEffect(() => {
    const list = row.current
    const chosen = list?.querySelector<HTMLElement>('[role=radio][data-checked]')
    if (!list || !chosen) return
    const overflow = chosen.offsetLeft + chosen.offsetWidth - list.clientWidth
    if (overflow > 0) list.scrollLeft = overflow + chosen.offsetWidth / 2
  }, [])
  const keyOf = (option: T) => String(option)
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend id={legendId} className={showLegend ? 'mb-1.5 p-0 font-bold' : 'sr-only'}>
        {legend}
      </legend>
      <RadioGroup
        ref={row}
        aria-labelledby={legendId}
        value={value === null ? null : keyOf(value)}
        onValueChange={(key) => {
          const option = options.find((candidate) => keyOf(candidate) === key)
          if (option === undefined) return
          const chip = row.current?.querySelector<HTMLElement>(
            `[data-chip="${CSS.escape(String(key))}"]`,
          )
          if (chip) popElement(chip)
          onChange(option)
        }}
        className="@container relative flex snap-x gap-2 overflow-x-auto pb-1"
      >
        {options.map((option) => {
          const checked = value === option
          return (
            <Radio.Root
              key={keyOf(option)}
              value={keyOf(option)}
              data-chip={keyOf(option)}
              // Picking the chosen chip again still counts ("5 分钟前" from now): the group
              // reports changes only.
              onClick={checked ? () => onChange(option) : undefined}
              className={cn(
                'press flex min-h-11 w-[28%] shrink-0 snap-start items-center justify-center rounded-lg border-2 border-b-4 text-center text-[min(1rem,4.6cqw)] font-extrabold whitespace-nowrap',
                'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-diaper',
                checked
                  ? [pressedTones[tone].box, pressedTones[tone].text]
                  : 'border-border bg-muted text-muted-foreground',
              )}
            >
              {optionLabel(option)}
            </Radio.Root>
          )
        })}
      </RadioGroup>
    </fieldset>
  )
}
