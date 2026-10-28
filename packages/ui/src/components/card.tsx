import { type VariantProps, cva } from 'class-variance-authority'
import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '../lib/utils'

export const cardVariants = cva('rounded-xl border-2 border-b-4 p-4', {
  variants: {
    /** Tinted cards highlight one category (a running timer, a day's feeds). */
    tone: {
      plain: 'border-border bg-card text-card-foreground',
      primary: 'border-primary/40 bg-accent',
      feeding: 'border-feeding/40 bg-feeding-soft',
      sleep: 'border-sleep/40 bg-sleep-soft',
      diaper: 'border-diaper/40 bg-diaper-soft',
      pumping: 'border-pumping/40 bg-pumping-soft',
    },
  },
  defaultVariants: { tone: 'plain' },
})

export type CardTone = NonNullable<VariantProps<typeof cardVariants>['tone']>

export interface CardProps extends HTMLAttributes<HTMLElement>, VariantProps<typeof cardVariants> {
  as?: 'div' | 'section'
}

export function Card({ tone, as: Tag = 'div', className, ...props }: CardProps) {
  return <Tag data-slot="card" className={cn(cardVariants({ tone }), className)} {...props} />
}

/** A card's heading; `small` for cards stacked in one section, like the AI settings. */
export function CardTitle({ small = false, children }: { small?: boolean; children: ReactNode }) {
  return (
    <h2 className={cn('m-0 font-extrabold', small ? 'text-body' : 'text-title')}>{children}</h2>
  )
}

/** A card with one muted line: signed out, loading, failed to load. */
export function NoticeCard({ children }: { children: ReactNode }) {
  return (
    <Card>
      <p className="m-0 text-muted-foreground">{children}</p>
    </Card>
  )
}
