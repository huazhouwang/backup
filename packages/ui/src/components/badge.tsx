import { type VariantProps, cva } from 'class-variance-authority'
import type { ReactNode } from 'react'

import { cn } from '../lib/utils'

export const badgeVariants = cva('rounded-full px-2 text-caption font-bold', {
  variants: {
    tone: {
      muted: 'bg-muted text-muted-foreground',
      primary: 'bg-accent text-accent-foreground',
      destructive: 'bg-destructive-soft text-destructive-text',
    },
  },
  defaultVariants: { tone: 'muted' },
})

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>

/** A small rounded label beside a name: a role, "已归档", "计时中". */
export function Badge({
  tone,
  className,
  children,
}: VariantProps<typeof badgeVariants> & { className?: string; children: ReactNode }) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ tone }), className)}>
      {children}
    </span>
  )
}
