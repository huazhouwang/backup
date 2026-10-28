import { cn } from '@lullabo/ui/utils'
import type { ReactNode } from 'react'

/** A round button beside the microphone, with what it does under it. */
export function SideButton({
  label,
  aimed,
  tone,
  onClick,
  children,
}: {
  label: string
  /** A held finger has slid onto it: letting go does what it says. */
  aimed: boolean
  tone: 'destructive' | 'primary'
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-20 flex-col items-center gap-2 text-caption font-extrabold"
    >
      <span
        className={cn(
          // Smaller than the microphone, and level with its middle.
          'mt-2.5 flex size-11 items-center justify-center rounded-full border-2 transition-[scale,background-color,border-color,color] duration-150',
          aimed
            ? [
                'scale-125 text-primary-foreground',
                tone === 'destructive' && 'border-destructive bg-destructive',
                // The bubble's dots take the button's colour.
                tone === 'primary' &&
                  'border-primary bg-primary [--color-muted:var(--color-primary)]',
              ]
            : [
                'border-border bg-background shadow-[0_3px_0_var(--color-border)]',
                tone === 'destructive' ? 'text-foreground' : 'text-primary',
              ],
        )}
      >
        {children}
      </span>
      <span className={aimed ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
    </button>
  )
}
