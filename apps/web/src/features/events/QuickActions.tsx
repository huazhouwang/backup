import type { Baby, Event } from '@bobo/shared'
import { useId, useState } from 'react'

import { Button } from '../../components/ui/Button'
import { RollingText } from '../../components/ui/RollingText'
import { Sheet } from '../../components/ui/Sheet'
import { useNow } from '../../lib/use-now'
import { m } from '../../paraglide/messages.js'
import { useAccess } from '../../sync/use-access'
import { useBabies } from '../babies/use-babies'
import {
  type Category,
  OTHER_CATEGORIES,
  categoryTitle,
  categoryTone,
  isInstantCategory,
} from './category'
import { DiaperForm } from './DiaperForm'
import { DurationForm } from './DurationForm'
import { EventIcon, categoryIconKind } from './EventIcon'
import { FeedingForm } from './FeedingForm'
import { useLogTogether } from './log-targets'
import { LogTargets } from './LogTargets'
import { OtherEventForm } from './OtherEventForm'
import { sinceText } from './SinceLast'

const MAIN_CATEGORIES = ['feeding', 'sleep', 'diaper'] as const

const sheetTitle = (category: Category | undefined) =>
  category === 'diaper' ? m.diaperSheetTitle() : category ? categoryTitle[category]() : ''

/**
 * The three big logging buttons, each saying how long since the last of its kind, plus a menu
 * for the other types; each opens its sheet. With more than one baby, records can be saved
 * for several at once (e.g. twins).
 */
export function QuickActions({ baby, events }: { baby: Baby; events: readonly Event[] }) {
  const babyId = baby.id
  const { active } = useBabies()
  const access = useAccess()
  const { together, toggle } = useLogTogether()
  const others = active.filter((other) => other.id !== babyId && access.forBaby(other).canLog)
  const selected = new Set(
    together.has(babyId) ? others.filter((other) => together.has(other.id)).map((o) => o.id) : [],
  )
  const babyIds = [babyId, ...selected]
  const targets =
    others.length > 0 ? (
      <LogTargets
        current={baby}
        others={others}
        selected={selected}
        onToggle={(id) => toggle(id, babyId)}
      />
    ) : null
  const now = useNow(30_000)
  const sinceId = useId()
  const [open, setOpen] = useState<Category | 'more' | null>(null)
  const close = () => setOpen(null)
  const logging = open === 'more' ? undefined : (open ?? undefined)
  const other = isInstantCategory(open) ? open : undefined

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-3">
          {MAIN_CATEGORIES.map((category) => (
            <Button
              key={category}
              tone={categoryTone[category]}
              size="lg"
              className="aspect-square min-h-28 flex-col gap-0.5 py-3"
              aria-describedby={`${sinceId}-${category}`}
              onClick={() => setOpen(category)}
            >
              <EventIcon kind={categoryIconKind(category)} variant="plain" className="size-9" />
              {categoryTitle[category]()}
              {/* Read as the button's description, not part of its name. */}
              <span
                id={`${sinceId}-${category}`}
                aria-hidden
                className="text-center text-caption leading-tight font-bold opacity-90"
              >
                <RollingText>{sinceText(events, category, now, { short: true })}</RollingText>
              </span>
            </Button>
          ))}
        </div>
        <Button variant="soft" tone="primary" block onClick={() => setOpen('more')}>
          {m.eventMoreRecords()}
        </Button>
      </div>
      <Sheet open={logging !== undefined} onClose={close} title={sheetTitle(logging)}>
        {logging === 'feeding' && (
          <FeedingForm babyIds={babyIds} events={events} targets={targets} onDone={close} />
        )}
        {(logging === 'sleep' || logging === 'pumping') && (
          <DurationForm
            key={logging}
            kind={logging}
            babyIds={babyIds}
            events={events}
            targets={targets}
            onDone={close}
          />
        )}
        {logging === 'diaper' && <DiaperForm babyIds={babyIds} targets={targets} onDone={close} />}
        {other && (
          <div className="flex flex-col gap-4">
            {targets}
            <OtherEventForm key={other} category={other} babyIds={babyIds} onDone={close} />
          </div>
        )}
      </Sheet>
      <Sheet open={open === 'more'} onClose={close} title={m.eventMoreRecords()}>
        <div className="grid grid-cols-2 gap-3">
          {OTHER_CATEGORIES.map((category) => (
            <Button
              key={category}
              variant="soft"
              tone={categoryTone[category]}
              size="lg"
              className="min-h-20 flex-col gap-1.5"
              onClick={() => setOpen(category)}
            >
              <EventIcon kind={categoryIconKind(category)} className="size-9" />
              {categoryTitle[category]()}
            </Button>
          ))}
        </div>
      </Sheet>
    </>
  )
}
