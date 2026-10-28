import { type Baby, type FamilySummary, familyDisplayName } from '@lullabo/shared'
import { Badge } from '@lullabo/ui/badge'
import { Card } from '@lullabo/ui/card'

import { m } from '../../paraglide/messages.js'
import { useAccess } from '../../sync/use-access'
import { useBabies } from '../babies/use-babies'
import { SettingsRow } from '../settings/SettingsLayout'
import { roleLabel } from './roles'

/** Families the user created first, then the rest in the order they joined. */
export const sortFamilies = (access: readonly FamilySummary[]) =>
  access.toSorted((a, b) => Number(b.role === 'owner') - Number(a.role === 'owner'))

/** A couple of names read better than a count; more than that becomes "3 个宝宝". */
function babiesLabel(babies: readonly Baby[]): string {
  return babies.length > 0 && babies.length <= 2
    ? babies.map((baby) => baby.name).join('、')
    : m.familyBabiesCount({ count: babies.length })
}

/** Settings entry for families: one compact row each, opening the family's own page. */
export function FamilyList() {
  const { access, userId } = useAccess()
  const { active } = useBabies()
  if (!userId || !access || access.length === 0) return null

  return (
    <Card className="flex flex-col gap-1">
      <h2 className="mb-1 text-title font-extrabold">{m.familyListTitle()}</h2>
      <ul className="m-0 flex list-none flex-col p-0">
        {sortFamilies(access).map((family) => {
          const babies = active.filter((baby) => baby.familyId === family.id)
          const details = [babiesLabel(babies)]
          if (family.memberCount) details.push(m.familyMembersCount({ count: family.memberCount }))
          return (
            <SettingsRow
              key={family.id}
              link={{ to: '/settings/family/$familyId', params: { familyId: family.id } }}
              title={familyDisplayName(family)}
              badge={<Badge className="shrink-0">{roleLabel[family.role]()}</Badge>}
              summary={details.join(' · ')}
            />
          )
        })}
      </ul>
    </Card>
  )
}
