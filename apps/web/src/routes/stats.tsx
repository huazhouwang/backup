import { localDateString, localMidnight, shiftDay } from '@lullabo/shared'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'

import { PageHeader } from '../components/PageHeader'
import { Button } from '../components/ui/Button'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { AchievementsView } from '../features/achievements/AchievementsView'
import { RequireBaby } from '../features/babies/RequireBaby'
import { useSelectedBaby } from '../features/babies/use-babies'
import { DaySummaryCards } from '../features/events/DaySummaryCards'
import { DayTimeline } from '../features/events/DayTimeline'
import { EditEventSheet } from '../features/events/EditEventSheet'
import { useBabyEvents } from '../features/events/use-events'
import { GrowthView } from '../features/growth/GrowthView'
import { TrendsView } from '../features/trends/TrendsView'
import { formatDate } from '../lib/i18n'
import { useNow } from '../lib/use-now'
import { m } from '../paraglide/messages.js'

const searchSchema = z.object({
  day: z.iso.date().optional().catch(undefined),
  view: z.enum(['trends', 'growth', 'achievements']).optional().catch(undefined),
})

type View = 'day' | 'trends' | 'growth' | 'achievements'

export const Route = createFileRoute('/stats')({
  validateSearch: searchSchema,
  component: StatsPage,
})

function StatsPage() {
  const { view = 'day' } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  return (
    <RequireBaby>
      <PageHeader title={m.statsTitle()} />
      <div className="mb-4">
        <SegmentedControl<View>
          label={m.statsTitle()}
          options={[
            { value: 'day', label: m.statsViewDay() },
            { value: 'trends', label: m.statsViewTrends() },
            { value: 'growth', label: m.statsViewGrowth() },
            { value: 'achievements', label: m.statsViewAchievements() },
          ]}
          value={view}
          onChange={(next) =>
            void navigate({ search: { view: next === 'day' ? undefined : next }, replace: true })
          }
        />
      </div>
      {view === 'growth' ? (
        <Growth />
      ) : view === 'trends' ? (
        <Trends />
      ) : view === 'achievements' ? (
        <Achievements />
      ) : (
        <DayView />
      )}
    </RequireBaby>
  )
}

function Trends() {
  const { baby } = useSelectedBaby()
  const events = useBabyEvents(baby?.id ?? '')
  return <TrendsView key={baby?.id} events={events} />
}

function Achievements() {
  const { baby } = useSelectedBaby()
  const events = useBabyEvents(baby?.id ?? '')
  return baby ? <AchievementsView key={baby.id} baby={baby} events={events} /> : null
}

function Growth() {
  const { baby } = useSelectedBaby()
  const events = useBabyEvents(baby?.id ?? '')
  return baby ? <GrowthView key={baby.id} baby={baby} events={events} /> : null
}

function DayView() {
  const { baby } = useSelectedBaby()
  const events = useBabyEvents(baby?.id ?? '')
  const now = useNow(60_000)
  const today = localDateString(now)
  const { day = today } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const [editingId, setEditingId] = useState<string | null>(null)
  const dayStart = localMidnight(day)
  const dayEnd = localMidnight(day, 1)
  const isToday = day >= today
  const goTo = (next: string) =>
    void navigate({
      search: (prev) => ({ ...prev, day: next >= today ? undefined : next }),
      replace: true,
    })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" onClick={() => goTo(shiftDay(day, -1))}>
          {m.dayPrev()}
        </Button>
        <span className="font-extrabold">{isToday ? m.dayToday() : formatDate(dayStart)}</span>
        <Button variant="outline" disabled={isToday} onClick={() => goTo(shiftDay(day, 1))}>
          {m.dayNext()}
        </Button>
      </div>
      <DaySummaryCards events={events} dayStart={dayStart} dayEnd={dayEnd} now={now} />
      <DayTimeline
        events={events}
        dayStart={dayStart}
        dayEnd={dayEnd}
        now={now}
        onSelect={(event) => setEditingId(event.id)}
      />
      <EditEventSheet eventId={editingId} events={events} onClose={() => setEditingId(null)} />
    </div>
  )
}
