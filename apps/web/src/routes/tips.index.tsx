import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'

import { PageHeader } from '../components/PageHeader'
import { RequireBaby } from '../features/babies/RequireBaby'
import { useSelectedBaby } from '../features/babies/use-babies'
import { TipsPage } from '../features/tips/TipsPage'
import { m } from '../paraglide/messages.js'

const searchSchema = z.object({
  /** A stage other than the baby's own, browsed from the chips. */
  stage: z.string().max(8).optional().catch(undefined),
})

export const Route = createFileRoute('/tips/')({
  validateSearch: searchSchema,
  component: Tips,
})

function Tips() {
  const { stage } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  return (
    <RequireBaby>
      <PageHeader title={m.tipsTitle()} />
      <Selected
        stage={stage}
        onStage={(next) => void navigate({ search: { stage: next }, replace: true })}
      />
    </RequireBaby>
  )
}

function Selected({
  stage,
  onStage,
}: {
  stage: string | undefined
  onStage: (id: string) => void
}) {
  const { baby } = useSelectedBaby()
  return baby ? <TipsPage key={baby.id} baby={baby} stageId={stage} onStage={onStage} /> : null
}
