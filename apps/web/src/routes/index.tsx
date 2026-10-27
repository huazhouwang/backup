import type { Baby } from '@lullabo/shared'
import { createFileRoute } from '@tanstack/react-router'

import { PullToRefresh } from '../components/PullToRefresh'
import { NoticeCard } from '../components/ui/Card'
import { BadgeToast } from '../features/achievements/BadgeToast'
import { RequireBaby } from '../features/babies/RequireBaby'
import { useSelectedBaby } from '../features/babies/use-babies'
import { QuickActions } from '../features/events/QuickActions'
import { RunningTimers } from '../features/events/RunningTimers'
import { SinceLast } from '../features/events/SinceLast'
import { TodayList } from '../features/events/TodayList'
import { useBabyEvents } from '../features/events/use-events'
import { ChatBar } from '../features/voice/ChatBar'
import { m } from '../paraglide/messages.js'
import { useAccess } from '../sync/use-access'

export const Route = createFileRoute('/')({
  component: TodayPage,
})

function TodayPage() {
  return (
    <PullToRefresh>
      <RequireBaby>
        <Today />
      </RequireBaby>
    </PullToRefresh>
  )
}

function Today() {
  const { baby } = useSelectedBaby()
  if (!baby) return null
  return <BabyToday key={baby.id} baby={baby} />
}

function BabyToday({ baby }: { baby: Baby }) {
  const events = useBabyEvents(baby.id)
  const { canLog } = useAccess().forBaby(baby)
  return (
    <div className="flex flex-col gap-6">
      {canLog ? (
        <QuickActions baby={baby} events={events} />
      ) : (
        <>
          <SinceLast events={events} />
          <NoticeCard>{m.roleViewerNotice()}</NoticeCard>
        </>
      )}
      <ChatBar />
      <RunningTimers events={events} />
      <TodayList events={events} />
      <BadgeToast baby={baby} events={events} />
    </div>
  )
}
