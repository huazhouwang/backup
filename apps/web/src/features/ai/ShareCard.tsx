import { Card, CardTitle } from '@lullabo/ui/card'
import { ToggleChip } from '@lullabo/ui/toggle-chip'

import { m } from '../../paraglide/messages.js'
import { useAccess } from '../../sync/use-access'
import { type UserAi, aiApi } from './api'
import { useAiChange } from './use-saved'

/** Families the user shares their AI with: members without a key of their own use it there. */
export function ShareCard({ ai }: { ai: UserAi }) {
  const { access = [] } = useAccess()
  const share = useAiChange(aiApi.share, (current, familyIds: string[]) => ({
    ...current,
    sharedFamilyIds: familyIds,
  }))
  if (access.length === 0) return null
  const shared = new Set(ai.sharedFamilyIds)
  const toggle = (familyId: string) => {
    const next = new Set(shared)
    if (next.has(familyId)) next.delete(familyId)
    else next.add(familyId)
    share.mutate([...next])
  }
  return (
    <Card as="section" className="flex flex-col gap-3">
      <CardTitle small>{m.aiShareTitle()}</CardTitle>
      <div className="flex flex-wrap gap-2">
        {access.map((family) => (
          <ToggleChip
            key={family.id}
            className="min-h-touch rounded-lg px-4 font-bold"
            pressed={shared.has(family.id)}
            onClick={() => toggle(family.id)}
          >
            {family.alias ?? family.name}
          </ToggleChip>
        ))}
      </div>
      <p className="m-0 text-caption text-muted-foreground">{m.aiShareHint()}</p>
    </Card>
  )
}
