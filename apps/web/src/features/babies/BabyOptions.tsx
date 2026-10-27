import { type Baby, type FamilySummary, familyDisplayName } from '@lullabo/shared'
import { clsx } from 'clsx'
import type { ReactNode } from 'react'

import { Pill, type PillTone } from '../../components/ui/Pill'
import { m } from '../../paraglide/messages.js'
import { useAccess } from '../../sync/use-access'
import { sortFamilies } from '../family/FamilyList'
import { ageLabel } from './age-label'
import { BabyAvatar } from './BabyAvatar'

interface BabyGroup {
  key: string
  title: string
  babies: Baby[]
}

/** Babies by family, the user's own families first; babies not yet in a family come last. */
function groupByFamily(babies: readonly Baby[], access: readonly FamilySummary[] | undefined) {
  const groups: BabyGroup[] = sortFamilies(access ?? []).map((family) => ({
    key: family.id,
    title: familyDisplayName(family),
    babies: babies.filter((baby) => baby.familyId === family.id),
  }))
  const known = new Set(groups.map((group) => group.key))
  const rest = babies.filter((baby) => baby.familyId === null || !known.has(baby.familyId))
  groups.push({ key: 'local', title: m.babyGroupLocal(), babies: rest })
  return groups.filter((group) => group.babies.length > 0)
}

export interface OptionBadge {
  label: string
  tone: PillTone
}

function Badge({ badge }: { badge: OptionBadge | undefined }) {
  if (!badge) return null
  return (
    <Pill tone={badge.tone} className="ml-auto">
      {badge.label}
    </Pill>
  )
}

/** A selectable option row, shaped like a baby row. */
export function OptionButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={clsx(
        'flex min-h-touch w-full items-center gap-3 rounded-xl border-2 px-3 py-2 text-left',
        selected ? 'border-diaper bg-diaper-soft' : 'border-border',
      )}
    >
      {children}
    </button>
  )
}

/** Babies to pick from, grouped by family when there is more than one. */
export function BabyOptions({
  babies,
  selectedId,
  onSelect,
  badges,
}: {
  babies: readonly Baby[]
  selectedId: string | null
  onSelect: (id: string) => void
  /** Optional markers shown at the end of babies' rows, by baby id. */
  badges?: ReadonlyMap<string, OptionBadge>
}) {
  const { access } = useAccess()
  const groups = groupByFamily(babies, access)
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <section key={group.key} className="flex flex-col gap-2">
          {groups.length > 1 && (
            <h3 className="text-caption font-bold text-fg-muted">{group.title}</h3>
          )}
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {group.babies.map((option) => (
              <li key={option.id}>
                <OptionButton
                  selected={option.id === selectedId}
                  onClick={() => onSelect(option.id)}
                >
                  <BabyAvatar name={option.name} color={option.avatarColor} />
                  <span className="flex flex-col">
                    <span className="font-extrabold">{option.name}</span>
                    <span className="text-caption text-fg-muted">{ageLabel(option.birthDate)}</span>
                  </span>
                  <Badge badge={badges?.get(option.id)} />
                </OptionButton>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
