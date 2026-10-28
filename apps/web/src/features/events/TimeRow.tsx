import { FormError } from '@lullabo/ui/form-error'
import { cn } from '@lullabo/ui/utils'

import { EditIcon } from '../../components/icons/EditIcon'
import { m } from '../../paraglide/messages.js'
import { formatDayTime, fromDateTimeLocal, toDateTimeLocal } from './time'

/**
 * One time of a record (its time, start or end): the label, the time as `formatDayTime`
 * shows it, and an edit icon at the far right. The whole row opens the device's date and
 * time picker. `at` is null for an end that isn't known yet.
 */
export function TimeRow({
  label,
  at,
  onChange,
  now,
  error,
}: {
  label: string
  at: number | null
  onChange: (at: number) => void
  now: number
  error?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <div
        className={cn(
          'relative flex min-h-touch items-center gap-3 rounded-lg border-2 bg-muted px-4',
          'has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-diaper',
          error ? 'border-destructive' : 'border-border',
        )}
      >
        <span className="font-bold text-muted-foreground">{label}</span>
        <span className="flex-1 text-right font-extrabold tabular-nums">
          {at === null ? m.timeNotRecorded() : formatDayTime(at, now)}
        </span>
        <EditIcon className="size-5 text-accent-foreground" />
        {/* Transparent over the row: a tap reaches the native picker on every platform. */}
        <input
          type="datetime-local"
          aria-label={label}
          aria-invalid={error ? true : undefined}
          max={toDateTimeLocal(now)}
          value={at === null ? '' : toDateTimeLocal(at)}
          onClick={(event) => {
            try {
              event.currentTarget.showPicker()
            } catch {
              // Older browsers open it on their own.
            }
          }}
          onChange={(event) => {
            const next = fromDateTimeLocal(event.target.value)
            if (!Number.isNaN(next)) onChange(next)
          }}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </div>
      {error && <FormError size="caption">{error}</FormError>}
    </div>
  )
}
