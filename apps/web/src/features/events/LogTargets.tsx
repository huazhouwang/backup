import type { Baby } from '@lullabo/shared'
import { clsx } from 'clsx'

import { ToggleChip } from '../../components/ui/ToggleChip'
import { m } from '../../paraglide/messages.js'
import { BabyAvatar } from '../babies/BabyAvatar'

/** Chips for the babies a record is saved for; the selected baby is always included. */
export function LogTargets({
  current,
  others,
  selected,
  onToggle,
}: {
  current: Baby
  others: readonly Baby[]
  selected: ReadonlySet<string>
  onToggle: (babyId: string) => void
}) {
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-2 p-0 text-caption font-bold text-fg-muted">{m.eventLogFor()}</legend>
      <div className="flex flex-wrap gap-2">
        {[current, ...others].map((baby) => {
          const isCurrent = baby.id === current.id
          const on = isCurrent || selected.has(baby.id)
          return (
            <ToggleChip
              key={baby.id}
              pressed={on}
              tintText={on}
              disabled={isCurrent}
              onClick={() => onToggle(baby.id)}
              className="flex min-h-touch items-center gap-2 rounded-full py-1 pr-4 pl-1 font-extrabold"
            >
              <span className={clsx(!on && 'opacity-50')}>
                <BabyAvatar name={baby.name} color={baby.avatarColor} size="sm" />
              </span>
              {baby.name}
            </ToggleChip>
          )
        })}
      </div>
    </fieldset>
  )
}
