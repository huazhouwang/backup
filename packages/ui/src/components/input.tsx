import { Field } from '@base-ui/react/field'
import type { InputHTMLAttributes, Ref } from 'react'

import { cn } from '../lib/utils'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  /** Read out but not shown, where the field's purpose is plain (a chat's message field). */
  labelHidden?: boolean
  hint?: string
  error?: string
  ref?: Ref<HTMLInputElement>
}

/**
 * Text input with a visible label, on Base UI's Field, which ties the label, the hint and the
 * error to the input. Font size stays >= 16px to avoid iOS zoom on focus.
 */
export function Input({ label, labelHidden, hint, error, className, ...props }: InputProps) {
  return (
    <Field.Root invalid={error ? true : undefined} className="flex flex-col gap-1.5">
      <Field.Label className={labelHidden ? 'sr-only' : 'font-bold'}>{label}</Field.Label>
      <Field.Control
        data-slot="input"
        className={cn(
          'min-h-touch rounded-lg border-2 border-input bg-muted px-4 text-body text-foreground',
          'placeholder:text-muted-foreground focus:border-diaper focus:outline-none',
          error && 'border-destructive',
          className,
        )}
        {...props}
      />
      {error && (
        <Field.Error match className="text-caption font-bold text-destructive-text">
          {error}
        </Field.Error>
      )}
      {hint && (
        <Field.Description className="text-caption text-muted-foreground">{hint}</Field.Description>
      )}
    </Field.Root>
  )
}
