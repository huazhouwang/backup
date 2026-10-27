import type { Baby, Event } from '@lullabo/shared'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { showToast } from '../../components/ui/Toast'
import { jsonCodec, readStored, stringList, writeStored } from '../../lib/store'
import { useNow } from '../../lib/use-now'
import { m } from '../../paraglide/messages.js'
import { computeBadges } from './achievements'
import { badgeLabel } from './badge-labels'

const MEDAL = '🏅'
/** How long the celebration stays: longer than a plain toast, there is a button to reach. */
const BADGE_TOAST_MS = 6000

const seenKey = (babyId: string) => `lullabo.seenBadges.${babyId}`
const idList = jsonCodec(stringList)

function readSeen(babyId: string): Set<string> | undefined {
  const ids = readStored(seenKey(babyId), idList)
  return ids && new Set(ids)
}

// Without storage the toast may show again next time; harmless.
const writeSeen = (babyId: string, ids: string[]) => writeStored(seenKey(babyId), idList, ids)

/** Celebrates a newly earned badge once; badges earned before this device saw them stay quiet. */
export function BadgeToast({ baby, events }: { baby: Baby; events: readonly Event[] }) {
  const now = useNow(60_000)
  const earned = computeBadges(baby, events, now).filter((badge) => badge.earned)
  const earnedIds = earned.map((badge) => badge.id)
  // First visit on this device: what's already earned counts as seen (an idempotent write).
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => {
    const stored = readSeen(baby.id)
    if (stored) return stored
    writeSeen(baby.id, earnedIds)
    return new Set(earnedIds)
  })

  const navigate = useNavigate()
  const badge = earned.find((candidate) => !seen.has(candidate.id))
  const title = badge && badgeLabel(badge, baby.name).title
  const key = earnedIds.join(',')

  useEffect(() => {
    if (!title) return
    const markSeen = () => {
      const ids = key.split(',')
      writeSeen(baby.id, ids)
      setSeen(new Set(ids))
    }
    // A few seconds, then out of the way of the page's header; it is seen however it goes.
    // The badge itself stays under 统计 → 成就.
    showToast(m.badgeNew({ title }), {
      id: 'badge',
      tone: 'success',
      icon: (
        <span aria-hidden className="inline-block animate-celebrate text-2xl">
          {MEDAL}
        </span>
      ),
      duration: BADGE_TOAST_MS,
      onDismiss: markSeen,
      onAutoClose: markSeen,
      action: {
        label: m.badgeView(),
        onClick: () => {
          markSeen()
          void navigate({ to: '/stats', search: { view: 'achievements' } })
        },
      },
    })
  }, [baby.id, key, navigate, title])

  return null
}
