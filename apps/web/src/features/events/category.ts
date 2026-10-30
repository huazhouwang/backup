import type { Event } from '@lullabo/shared'
import type { ButtonTone } from '@lullabo/ui/button'

import { m } from '../../paraglide/messages.js'

/** One per event type; the unit for titles, colors, icons and timeline lanes. */
export type Category = Event['type']

/** How each type looks: its title, its colour as a button, and the fill of its icon and dot. */
interface CategoryLook {
  title: () => string
  tone: ButtonTone
  dot: string
}

// Colours are full class names so Tailwind can find them.
export const CATEGORY_LOOK: Record<Category, CategoryLook> = {
  feeding: { title: m.categoryFeeding, tone: 'feeding', dot: 'bg-feeding' },
  sleep: { title: m.categorySleep, tone: 'sleep', dot: 'bg-sleep' },
  diaper: { title: m.categoryDiaper, tone: 'diaper', dot: 'bg-diaper' },
  pumping: { title: m.categoryPumping, tone: 'pumping', dot: 'bg-pumping' },
  temperature: { title: m.categoryTemperature, tone: 'destructive', dot: 'bg-destructive' },
  medication: { title: m.categoryMedication, tone: 'medication', dot: 'bg-medication' },
  note: { title: m.categoryNote, tone: 'note', dot: 'bg-note' },
  growth: { title: m.categoryGrowth, tone: 'primary', dot: 'bg-primary' },
  vaccination: { title: m.categoryVaccination, tone: 'primary', dot: 'bg-primary' },
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
