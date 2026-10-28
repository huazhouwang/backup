import type { Baby, Event } from '@lullabo/shared'
import { Card } from '@lullabo/ui/card'
import { cn } from '@lullabo/ui/utils'

import { useNow } from '../../lib/use-now'
import { m } from '../../paraglide/messages.js'
import { type BadgeGroup, computeBadges, computeStreak } from './achievements'
import { badgeLabel } from './badge-labels'

const GROUP_COLOR: Record<BadgeGroup, string> = {
  records: 'bg-primary border-accent-foreground',
  streak: 'bg-feeding border-feeding-text',
  night: 'bg-sleep border-sleep-text',
  firsts: 'bg-diaper border-diaper-text',
  age: 'bg-avatar-pink border-avatar-pink',
  family: 'bg-avatar-yellow border-avatar-yellow',
}

export function Flame({ lit, className }: { lit: boolean; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className={className}>
      <path
        d="M24 4c2 7 10 11 10 22a10 10 0 0 1-20 0c0-5 2-8 5-11 0 4 2 6 4 6 0-7-1-11 1-17z"
        className={lit ? 'fill-feeding' : 'fill-border'}
      />
      <path
        d="M24 26c2 3 5 5 5 9a5 5 0 0 1-10 0c0-3 2-5 5-9z"
        className={lit ? 'fill-avatar-yellow' : 'fill-muted'}
      />
    </svg>
  )
}

/** Logging streak and badges for the selected baby, all computed on the device. */
export function AchievementsView({ baby, events }: { baby: Baby; events: readonly Event[] }) {
  const now = useNow(60_000)
  const streak = computeStreak(events, now)
  const badges = computeBadges(baby, events, now)
  const earned = badges.filter((badge) => badge.earned).length

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex items-center gap-4">
        <Flame lit={streak.current > 0} className="size-16 shrink-0" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-caption font-bold text-muted-foreground">{m.streakLabel()}</span>
          <span className="text-title font-extrabold tabular-nums">
            {m.streakDays({ days: streak.current })}
          </span>
          <span className="text-caption text-muted-foreground">
            {streak.loggedToday
              ? m.streakToday()
              : streak.current > 0
                ? m.streakKeep()
                : m.streakStart()}
          </span>
          {streak.best > 0 && (
            <span className="text-caption font-bold text-feeding-text">
              {m.streakBest({ days: streak.best })}
            </span>
          )}
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="m-0 text-title font-extrabold">{m.badgeTitle()}</h2>
          <span className="text-caption font-bold text-muted-foreground">
            {m.badgeEarned({ earned, total: badges.length })}
          </span>
        </div>
        <ul className="m-0 grid list-none grid-cols-3 gap-x-2 gap-y-4 p-0">
          {badges.map((badge) => {
            const label = badgeLabel(badge, baby.name)
            return (
              <li key={badge.id} className="flex flex-col items-center gap-1 text-center">
                <span
                  aria-hidden
                  className={cn(
                    'flex size-16 items-center justify-center rounded-full border-b-4 font-extrabold',
                    label.mark.length > 2 ? 'text-body' : 'text-title',
                    badge.earned
                      ? `${GROUP_COLOR[badge.group]} text-primary-foreground`
                      : 'border-border bg-muted text-muted-foreground',
                  )}
                >
                  {label.mark}
                </span>
                <span className={cn('font-extrabold', !badge.earned && 'text-muted-foreground')}>
                  {label.title}
                  {!badge.earned && <span className="sr-only">{` ${m.badgeLocked()}`}</span>}
                </span>
                <span className="text-caption text-muted-foreground">
                  {badge.earned || !badge.progress
                    ? label.description
                    : m.badgeProgress(badge.progress)}
                </span>
              </li>
            )
          })}
        </ul>
      </Card>
    </div>
  )
}
