import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import { m as motion } from 'motion/react'
import { useId } from 'react'

import { cn } from '../lib/utils'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

export interface SegmentedControlProps<T extends string> {
  label: string
  options: readonly SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  /** How the label shows above the control: as a form field label, a caption, or not at all. */
  labelStyle?: 'hidden' | 'field' | 'caption'
}

const legendClass = {
  hidden: 'sr-only',
  field: 'mb-1.5 p-0 font-bold',
  caption: 'mb-2 p-0 text-caption font-bold text-muted-foreground',
} as const

/**
 * Single-choice toggle (e.g. left/right breast, nap/night). Built on Base UI's radio group,
 * so arrow-key navigation and screen reader semantics come for free.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  labelStyle = 'hidden',
}: SegmentedControlProps<T>) {
  const name = useId()
  const legendId = useId()

  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend id={legendId} className={legendClass[labelStyle]}>
        {label}
      </legend>
      <RadioGroup
        aria-labelledby={legendId}
        value={value}
        onValueChange={onChange}
        className="flex gap-1 rounded-lg border-2 border-border bg-muted p-1"
      >
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              'relative flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-md font-extrabold transition-colors',
              'has-checked:text-diaper-text',
              'text-muted-foreground has-focus-visible:outline-3 has-focus-visible:outline-diaper',
            )}
          >
            {option.value === value && (
              // One highlight per control, sliding to the chosen option.
              <motion.span
                aria-hidden
                layoutId={name}
                className="absolute inset-0 rounded-md bg-background shadow-segment"
              />
            )}
            <Radio.Root value={option.value} className="sr-only" />
            <span className="relative">{option.label}</span>
          </label>
        ))}
      </RadioGroup>
    </fieldset>
  )
}
