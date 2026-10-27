import { RECORD_KINDS, type RecordKind } from '@lullabo/shared'

import type { ButtonTone } from '../../components/ui/Button'
import type { ChipTone } from '../../components/ui/ToggleChip'
import { m } from '../../paraglide/messages.js'
import { type Category, categoryTone } from './category'

/** Kinds that span time (RECORD_KINDS timing 'duration'): timed live, or logged afterwards. */
export type DurationKind = Extract<RecordKind, 'breast' | 'bottle' | 'solids' | 'sleep' | 'pumping'>

export const isDurationKind = (kind: RecordKind): kind is DurationKind =>
  RECORD_KINDS[kind].timing === 'duration'

/** How each duration kind looks: its record type, colours and the running card's words. */
interface DurationLook {
  type: Category
  title: () => string
  /** Title of the running card, e.g. "亲喂中". */
  running: () => string
  /** The button that ends it, e.g. "醒了" for sleep. */
  stop: () => string
}

export const DURATION_LOOK: Record<DurationKind, DurationLook> = {
  breast: { type: 'feeding', title: m.feedBreast, running: m.timerBreast, stop: m.timerStop },
  bottle: { type: 'feeding', title: m.feedBottle, running: m.timerBottle, stop: m.timerStop },
  solids: { type: 'feeding', title: m.feedSolids, running: m.timerSolids, stop: m.timerStop },
  sleep: { type: 'sleep', title: m.categorySleep, running: m.timerSleeping, stop: m.timerWake },
  pumping: {
    type: 'pumping',
    title: m.categoryPumping,
    running: m.timerPumping,
    stop: m.timerStop,
  },
}

export const durationTone = (kind: DurationKind): ButtonTone =>
  categoryTone[DURATION_LOOK[kind].type]

/** Chips come in fewer colours than buttons. */
export const durationChipTone = (kind: DurationKind): ChipTone =>
  DURATION_LOOK[kind].type === 'feeding' ? 'feeding' : 'primary'
