import { type VariantProps, cva } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'

import { cn } from '../lib/utils'

const TONES = [
  'primary',
  'feeding',
  'sleep',
  'diaper',
  'pumping',
  'medication',
  'note',
  'destructive',
] as const
export type ButtonTone = (typeof TONES)[number]

/** Per tone: the filled look, the tinted look, and the text colour of an outline or ghost. */
const toneClasses: Record<ButtonTone, { fill: string; soft: string; text: string }> = {
  primary: {
    fill: 'bg-primary border-primary-edge',
    soft: 'bg-accent text-accent-foreground border-primary/30',
    text: 'text-accent-foreground',
  },
  feeding: {
    fill: 'bg-feeding border-feeding-edge',
    soft: 'bg-feeding-soft text-feeding-text border-feeding/30',
    text: 'text-feeding-text',
  },
  sleep: {
    fill: 'bg-sleep border-sleep-edge',
    soft: 'bg-sleep-soft text-sleep-text border-sleep/30',
    text: 'text-sleep-text',
  },
  diaper: {
    fill: 'bg-diaper border-diaper-edge',
    soft: 'bg-diaper-soft text-diaper-text border-diaper/30',
    text: 'text-diaper-text',
  },
  pumping: {
    fill: 'bg-pumping border-pumping-edge',
    soft: 'bg-pumping-soft text-pumping-text border-pumping/30',
    text: 'text-pumping-text',
  },
  medication: {
    fill: 'bg-medication border-medication-edge',
    soft: 'bg-medication-soft text-medication-text border-medication/30',
    text: 'text-medication-text',
  },
  note: {
    fill: 'bg-note border-note-edge',
    soft: 'bg-note-soft text-note-text border-note/30',
    text: 'text-note-text',
  },
  destructive: {
    fill: 'bg-destructive border-destructive-edge',
    soft: 'bg-destructive-soft text-destructive-text border-destructive/30',
    text: 'text-destructive-text',
  },
}

/**
 * The classes of a button, for a link that looks like one. `variant` is how it is drawn,
 * `tone` its colour: each tone exists in every variant.
 */
export const buttonVariants = cva(
  [
    'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg font-extrabold',
    'disabled:pointer-events-none disabled:opacity-50',
  ],
  {
    variants: {
      variant: {
        default: 'press border-b-4 text-primary-foreground',
        soft: 'press border-2 border-b-4',
        outline: 'press border-2 border-b-4 border-border bg-background',
        ghost: 'active:bg-muted',
      },
      // The colours come with the variant, below.
      tone: {
        primary: '',
        feeding: '',
        sleep: '',
        diaper: '',
        pumping: '',
        medication: '',
        note: '',
        destructive: '',
      },
      size: {
        default: 'min-h-touch px-4 text-body',
        lg: 'min-h-14 px-6 text-label',
      },
      block: { true: 'w-full', false: '' },
    },
    compoundVariants: TONES.flatMap((tone) => [
      { variant: 'default' as const, tone, className: toneClasses[tone].fill },
      { variant: 'soft' as const, tone, className: toneClasses[tone].soft },
      { variant: ['outline' as const, 'ghost' as const], tone, className: toneClasses[tone].text },
    ]),
    defaultVariants: { variant: 'default', tone: 'primary', size: 'default', block: false },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

/**
 * Flat button with a solid bottom edge that collapses when pressed (no gradients or
 * shadows). Pressed state is visible on touch devices; nothing depends on hover.
 */
export function Button({
  tone,
  variant,
  size,
  block,
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      data-slot="button"
      className={cn(buttonVariants({ tone, variant, size, block }), className)}
      {...props}
    />
  )
}
