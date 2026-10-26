import type { TipTopic } from '@bobo/shared'

/** Each topic's colours: the soft card, its edge and its text. */
export const TOPIC_STYLE: Record<TipTopic, { card: string; text: string; icon: string }> = {
  sleep: { card: 'bg-sleep-soft border-sleep/30', text: 'text-sleep-text', icon: 'text-sleep' },
  feeding: {
    card: 'bg-feeding-soft border-feeding/30',
    text: 'text-feeding-text',
    icon: 'text-feeding',
  },
  play: { card: 'bg-diaper-soft border-diaper/30', text: 'text-diaper-text', icon: 'text-diaper' },
  care: {
    card: 'bg-primary-soft border-primary/30',
    text: 'text-primary-text',
    icon: 'text-primary',
  },
  safety: {
    card: 'bg-medication-soft border-medication/30',
    text: 'text-medication-text',
    icon: 'text-medication',
  },
}
