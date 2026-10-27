import { type Event, MINUTE, isRunning } from '@lullabo/shared'

import { RollingText } from '../../components/ui/RollingText'
import { useNow } from '../../lib/use-now'
import { m } from '../../paraglide/messages.js'
import { durationLabel } from './duration-label'
import { EventIcon, type IconKind } from './EventIcon'
import { lastActivityAt } from './summary'

export type SinceCategory = 'feeding' | 'sleep' | 'diaper'

/**
 * How long since the last of a kind, the main question at 3am: "2 小时 10 分钟前", "醒了 1
 * 小时 5 分钟" (or "正在睡"), "还没有记录".
 */
export function sinceText(
  events: readonly Event[],
  category: SinceCategory,
  now: number,
  { short = false } = {},
) {
  if (category === 'sleep' && events.some((event) => event.type === 'sleep' && isRunning(event))) {
    return m.sinceSleepingNow()
  }
  const at = lastActivityAt(events, category, now)
  if (at === undefined) return m.sinceNever()
  // Within a minute, or a moment ahead of the clock: "刚刚", not "0 分钟前".
  if (now - at < MINUTE) return category === 'sleep' ? m.sinceJustAwake() : m.timeJustNow()
  const duration = durationLabel(now - at, { short })
  return category === 'sleep' ? m.sinceAwake({ duration }) : m.timeAgo({ duration })
}

const TILES: { category: SinceCategory; label: () => string; icon: IconKind }[] = [
  { category: 'feeding', label: m.sinceFeeding, icon: 'bottle' },
  { category: 'sleep', label: m.sinceSleep, icon: 'sleep' },
  { category: 'diaper', label: m.sinceDiaper, icon: 'diaper' },
]

/** "Time since last", for those who can only look: the logging buttons show it to the rest. */
export function SinceLast({ events }: { events: readonly Event[] }) {
  const now = useNow(30_000)
  return (
    <dl className="m-0 grid grid-cols-3 gap-2">
      {TILES.map((tile) => (
        <div key={tile.category} className="flex flex-col gap-0.5 rounded-lg bg-surface px-3 py-2">
          <dt className="flex items-center gap-1 whitespace-nowrap text-caption text-fg-muted">
            <EventIcon kind={tile.icon} className="size-4" />
            {tile.label()}
          </dt>
          <dd className="m-0 font-extrabold">
            <RollingText>{sinceText(events, tile.category, now)}</RollingText>
          </dd>
        </div>
      ))}
    </dl>
  )
}
