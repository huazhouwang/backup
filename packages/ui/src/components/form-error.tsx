import type { ReactNode } from 'react'

import { cn } from '../lib/utils'

/** Error under a form or action, announced to screen readers when it appears. */
export function FormError({
  children,
  size = 'body',
}: {
  children: ReactNode
  size?: 'body' | 'caption'
}) {
  return (
    <p
      role="alert"
      className={cn('font-bold text-destructive-text', size === 'caption' && 'text-caption')}
    >
      {children}
    </p>
  )
}
