import type { Event } from '@lullabo/shared'
import { type ReactNode, useState } from 'react'

import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { m } from '../../paraglide/messages.js'
import { DurationForm } from './DurationForm'

type Kind = 'breast' | 'bottle' | 'solids'

/** Feeds: breastfeeding, bottle or solids, each logged like any duration record. */
export function FeedingForm({
  babyIds,
  events,
  targets,
  onDone,
}: {
  babyIds: readonly string[]
  events: readonly Event[]
  targets?: ReactNode
  onDone: () => void
}) {
  const [kind, setKind] = useState<Kind>('breast')
  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl<Kind>
        label={m.categoryFeeding()}
        options={[
          { value: 'breast', label: m.feedBreast() },
          { value: 'bottle', label: m.feedBottle() },
          { value: 'solids', label: m.feedSolids() },
        ]}
        value={kind}
        onChange={setKind}
      />
      <DurationForm
        key={kind}
        kind={kind}
        babyIds={babyIds}
        events={events}
        targets={targets}
        onDone={onDone}
      />
    </div>
  )
}
