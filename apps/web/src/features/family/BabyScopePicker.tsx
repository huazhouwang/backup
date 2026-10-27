import type { Baby } from '@lullabo/shared'

import { m } from '../../paraglide/messages.js'
import { BabyAvatar } from '../babies/BabyAvatar'

/** "All babies", or a chosen subset, for an invite or a member. */
export function BabyScopePicker({
  babies,
  value,
  onChange,
}: {
  babies: Baby[]
  value: string[] | null
  onChange: (value: string[] | null) => void
}) {
  const toggle = (id: string) => {
    const current = value ?? []
    onChange(current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend className="mb-2 font-bold">{m.inviteBabiesLabel()}</legend>
      <label className="flex min-h-touch items-center gap-3">
        <input
          type="checkbox"
          className="size-5 accent-diaper"
          checked={value === null}
          onChange={(e) => onChange(e.target.checked ? null : babies.map((baby) => baby.id))}
        />
        <span className="font-bold">{m.babyAll()}</span>
      </label>
      {value !== null &&
        babies.map((baby) => (
          <label key={baby.id} className="flex min-h-touch items-center gap-3 pl-8">
            <input
              type="checkbox"
              className="size-5 accent-diaper"
              checked={value.includes(baby.id)}
              onChange={() => toggle(baby.id)}
            />
            <BabyAvatar name={baby.name} color={baby.avatarColor} />
            <span>{baby.name}</span>
          </label>
        ))}
    </fieldset>
  )
}

/** "全部宝宝" or the names of the babies in scope. */
export function scopeLabel(babyIds: string[] | null, babies: Baby[]): string {
  if (babyIds === null) return m.babyAll()
  return babies
    .filter((baby) => babyIds.includes(baby.id))
    .map((baby) => baby.name)
    .join('、')
}
