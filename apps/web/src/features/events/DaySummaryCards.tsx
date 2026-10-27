import type { Event } from '@lullabo/shared'
import { clsx } from 'clsx'

import { Card } from '../../components/ui/Card'
import { formatQuantity, unitLabel } from '../../lib/units'
import { m } from '../../paraglide/messages.js'
import { durationLabel } from './duration-label'
import { EventIcon, type IconKind } from './EventIcon'
import { summarizeDay } from './summary'

const TEXT = {
  feeding: 'text-feeding-text',
  sleep: 'text-sleep-text',
  diaper: 'text-diaper-text',
  primary: 'text-primary-text',
} as const

export function DaySummaryCards({
  events,
  dayStart,
  dayEnd,
  now,
}: {
  events: readonly Event[]
  dayStart: number
  dayEnd: number
  now: number
}) {
  const s = summarizeDay(events, dayStart, dayEnd, now)
  const volumeUnit = unitLabel('volume')
  const diaperCount = s.diapers.wet + s.diapers.dirty + s.diapers.mixed
  const cards: {
    title: string
    icon?: IconKind
    value: string
    details: string[]
    tone: 'feeding' | 'sleep' | 'diaper' | 'primary'
  }[] = [
    {
      title: m.categoryFeeding(),
      icon: 'bottle',
      value: m.summaryFeedCount({ count: s.feedings }),
      details: [
        m.summaryBottle({ amount: formatQuantity('volume', s.bottleMl), unit: volumeUnit }),
        ...(s.bottleBreastMl > 0 && s.bottleFormulaMl > 0
          ? [
              m.summaryBottleSplit({
                breast: formatQuantity('volume', s.bottleBreastMl),
                formula: formatQuantity('volume', s.bottleFormulaMl),
                unit: volumeUnit,
              }),
            ]
          : []),
        m.summaryBreast({ duration: durationLabel(s.breastMs) }),
      ],
      tone: 'feeding',
    },
    {
      title: m.categorySleep(),
      icon: 'sleep',
      value: m.summarySleepTotal({ duration: durationLabel(s.sleepMs) }),
      details: [
        m.summaryNaps({ count: s.naps }),
        m.summaryLongest({ duration: durationLabel(s.longestSleepMs) }),
      ],
      tone: 'sleep',
    },
    {
      title: m.categoryDiaper(),
      icon: 'diaper',
      value: m.summaryDiaperCount({ count: diaperCount }),
      details: [m.summaryDiaperDetail(s.diapers)],
      tone: 'diaper',
    },
  ]
  const other = [
    s.pumpingMl > 0 &&
      m.summaryPumping({ amount: formatQuantity('volume', s.pumpingMl), unit: volumeUnit }),
    s.latestCelsius !== null &&
      m.summaryTemperature({
        value: formatQuantity('temperature', s.latestCelsius),
        unit: unitLabel('temperature'),
      }),
    s.medications > 0 && m.summaryMedication({ count: s.medications }),
    s.notes > 0 && m.summaryNotes({ count: s.notes }),
  ].filter((detail) => typeof detail === 'string')
  // Only shown on days that have any of the less frequent records.
  if (other.length > 0) {
    cards.push({
      title: m.categoryOther(),
      value: '',
      details: other,
      tone: 'primary',
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {cards.map((card) => (
        <Card
          as="section"
          key={card.title}
          tone={card.tone}
          className={clsx('flex flex-col gap-1', TEXT[card.tone])}
        >
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-title font-extrabold">
              {card.icon && <EventIcon kind={card.icon} className="size-8" />}
              {card.title}
            </h2>
            <span className="text-title font-extrabold text-fg">{card.value}</span>
          </div>
          {card.details.map((detail) => (
            <p key={detail} className="m-0 text-fg-muted">
              {detail}
            </p>
          ))}
        </Card>
      ))}
    </div>
  )
}
