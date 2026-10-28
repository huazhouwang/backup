import { describe, expect, it } from 'vitest'

import { cn } from './utils'

describe('cn', () => {
  it('keeps a size and a colour side by side, the theme scales included', () => {
    expect(cn('text-caption text-muted-foreground')).toBe('text-caption text-muted-foreground')
    expect(cn('text-title font-extrabold', 'text-accent-foreground')).toBe(
      'text-title font-extrabold text-accent-foreground',
    )
    expect(cn('shadow-segment bg-background')).toBe('shadow-segment bg-background')
    expect(cn('min-h-touch max-w-app')).toBe('min-h-touch max-w-app')
  })

  it('lets a later class replace an earlier one that sets the same thing', () => {
    expect(cn('bg-muted px-4', 'bg-accent')).toBe('px-4 bg-accent')
    expect(cn('text-caption', 'text-title')).toBe('text-title')
    expect(cn('rounded-xl', false, undefined, 'rounded-lg')).toBe('rounded-lg')
  })
})
