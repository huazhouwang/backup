import { VACCINE_REACTIONS, type VaccineReaction } from '@lullabo/shared'
import { ToggleChip } from '@lullabo/ui/toggle-chip'

import { m } from '../../paraglide/messages.js'

const LABEL: Record<VaccineReaction, () => string> = {
  fever: m.vaccineReactionFever,
  swelling: m.vaccineReactionSwelling,
  fussy: m.vaccineReactionFussy,
}
export const reactionLabel = (reaction: VaccineReaction) => LABEL[reaction]()

/** How the baby took a vaccination: none, or any of fever, swelling and fussing. */
export function ReactionChips({
  value,
  onChange,
}: {
  value: readonly VaccineReaction[]
  onChange: (reactions: VaccineReaction[]) => void
}) {
  const chip = 'min-h-touch rounded-full px-4 font-extrabold'
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-2 p-0 font-bold">{m.vaccineReaction()}</legend>
      <div className="flex flex-wrap gap-2">
        <ToggleChip pressed={value.length === 0} className={chip} onClick={() => onChange([])}>
          {m.vaccineReactionNone()}
        </ToggleChip>
        {VACCINE_REACTIONS.map((reaction) => (
          <ToggleChip
            key={reaction}
            pressed={value.includes(reaction)}
            className={chip}
            onClick={() =>
              onChange(
                value.includes(reaction)
                  ? value.filter((other) => other !== reaction)
                  : [...value, reaction],
              )
            }
          >
            {reactionLabel(reaction)}
          </ToggleChip>
        ))}
      </div>
    </fieldset>
  )
}
