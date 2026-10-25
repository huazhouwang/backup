import { clsx } from 'clsx'
import { type InputHTMLAttributes, type Ref, useId } from 'react'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  /** Read out but not shown, where the field's purpose is plain (a chat's message field). */
  labelHidden?: boolean
  hint?: string
  error?: string
  ref?: Ref<HTMLInputElement>
}

/** Text input with a visible label. Font size stays >= 16px to avoid iOS zoom on focus. */
export function Input({ label, labelHidden, hint, error, className, id, ...props }: InputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const hintId = hint ? `${inputId}-hint` : undefined
  const errorId = error ? `${inputId}-error` : undefined
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className={labelHidden ? 'sr-only' : 'font-bold'}>
        {label}
      </label>
      <input
        id={inputId}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={clsx(
          'min-h-touch rounded-lg border-2 border-border bg-surface px-4 text-body text-fg',
          'placeholder:text-fg-muted focus:border-diaper focus:outline-none',
          error && 'border-danger',
          className,
        )}
        {...props}
      />
      {error && (
        <p id={errorId} className="text-caption font-bold text-danger-text">
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} className="text-caption text-fg-muted">
          {hint}
        </p>
      )}
    </div>
  )
}
