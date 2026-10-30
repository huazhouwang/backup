import type { RecordKind } from '@lullabo/shared'
import type { Dispatch, SetStateAction } from 'react'

import { ReactionChips } from '../../vaccines/ReactionChips'
import { DiaperFields } from './DiaperFields'
import type { DraftErrors, RecordDrafts } from './drafts'
import {
  BottleFields,
  GrowthFields,
  MedicationFields,
  PumpingFields,
  SolidsField,
  TemperatureField,
} from './EventFields'

/**
 * The fields of one kind of record, on the drafts of drafts.ts. Kinds whose details live
 * elsewhere (breastfeeding and sleep times, a note's text) have none here.
 */
export function RecordFields({
  kind,
  drafts,
  onChange,
  errors,
  editing = false,
}: {
  kind: RecordKind
  drafts: RecordDrafts
  onChange: Dispatch<SetStateAction<RecordDrafts>>
  errors: DraftErrors
  /** Editing a stored record (see BottleFields). */
  editing?: boolean
}) {
  const set =
    <K extends keyof RecordDrafts>(key: K) =>
    (value: RecordDrafts[K]) =>
      onChange((current) => ({ ...current, [key]: value }))
  switch (kind) {
    case 'bottle':
      return (
        <BottleFields
          value={drafts.bottle}
          onChange={set('bottle')}
          error={errors.amount}
          editing={editing}
        />
      )
    case 'solids':
      return <SolidsField value={drafts.food} onChange={set('food')} error={errors.food} />
    case 'diaper':
      return <DiaperFields value={drafts.diaper} onChange={set('diaper')} />
    case 'pumping':
      return (
        <PumpingFields value={drafts.pumping} onChange={set('pumping')} error={errors.amount} />
      )
    case 'growth':
      return <GrowthFields value={drafts.growth} onChange={set('growth')} errors={errors} />
    case 'temperature':
      return (
        <TemperatureField value={drafts.celsius} onChange={set('celsius')} error={errors.celsius} />
      )
    case 'medication':
      return (
        <MedicationFields
          value={drafts.medication}
          onChange={set('medication')}
          error={errors.name}
        />
      )
    case 'vaccination':
      // Which vaccine and dose is the record itself; how the baby took it can change.
      return (
        <ReactionChips
          value={drafts.vaccination.reactions}
          onChange={(reactions) => set('vaccination')({ ...drafts.vaccination, reactions })}
        />
      )
    case 'breast':
    case 'sleep':
    case 'note':
      return null
    default:
      return kind satisfies never
  }
}
