import type { Event } from '@lullabo/shared'

import type { ButtonTone } from '../../components/ui/Button'
import { m } from '../../paraglide/messages.js'

/** One per event type; the unit for titles, colors, icons and timeline lanes. */
export type Category = Event['type']

export const categoryTitle: Record<Category, () => string> = {
  feeding: m.categoryFeeding,
  sleep: m.categorySleep,
  diaper: m.categoryDiaper,
  pumping: m.categoryPumping,
  temperature: m.categoryTemperature,
  medication: m.categoryMedication,
  note: m.categoryNote,
  growth: m.categoryGrowth,
}

// Colors are full class names so Tailwind can find them; keep these maps side by side.
export const categoryTone: Record<Category, ButtonTone> = {
  feeding: 'feeding',
  sleep: 'sleep',
  diaper: 'diaper',
  pumping: 'pumping',
  temperature: 'danger',
  medication: 'medication',
  note: 'note',
  growth: 'primary',
}

/** Fill of a type's icon badge and timeline dot. */
export const categoryDot: Record<Category, string> = {
  feeding: 'bg-feeding',
  sleep: 'bg-sleep',
  diaper: 'bg-diaper',
  pumping: 'bg-pumping',
  temperature: 'bg-danger',
  medication: 'bg-medication',
  note: 'bg-note',
  growth: 'bg-primary',
}

/** Event types logged from the "more" sheet rather than the three big buttons. */
export const OTHER_CATEGORIES = ['growth', 'pumping', 'temperature', 'medication', 'note'] as const
export type OtherCategory = (typeof OTHER_CATEGORIES)[number]
/** The "more" types that happen at one time; pumping takes time like a feed. */
export type InstantCategory = Exclude<OtherCategory, 'pumping'>
export const isInstantCategory = (category: unknown): category is InstantCategory =>
  OTHER_CATEGORIES.some((other) => other === category && other !== 'pumping')

/** Timeline lane for each type; the less frequent types share one lane. */
export type Lane = 'feeding' | 'sleep' | 'diaper' | 'other'
export function laneOf(category: Category): Lane {
  return category === 'feeding' || category === 'sleep' || category === 'diaper'
    ? category
    : 'other'
}
