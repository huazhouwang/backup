import type { VaccinePlanSettings } from '@lullabo/shared'

import type { LocalStore } from '../../db'
import { currentFamilyId, markDirty, purgeBabyEvents, writeLocal } from '../../sync/local'
import { type BabyInput, buildBaby } from './records'

/** Adds a baby to `familyId`; null keeps it local until it is claimed (see claimLocalData). */
export function createBaby(
  store: LocalStore,
  input: BabyInput,
  familyId: string | null = currentFamilyId(store),
) {
  const baby = { ...buildBaby(input), familyId }
  writeLocal(store, () => {
    store.babies.insert(baby)
    markDirty(store, 'babies', baby)
  })
  return baby
}

function updateAndMark(
  store: LocalStore,
  id: string,
  change: (draft: { updatedAt: number }) => void,
) {
  store.babies.update(id, change)
  const updated = store.babies.get(id)
  if (updated) markDirty(store, 'babies', updated)
}

export function updateBaby(store: LocalStore, id: string, input: BabyInput) {
  return writeLocal(store, () =>
    updateAndMark(store, id, (draft) => {
      Object.assign(draft, input)
      draft.updatedAt = Date.now()
    }),
  )
}

/** Sets the family's vaccination plan for a baby (which kinds, which self-paid vaccines). */
export function setVaccinePlan(store: LocalStore, id: string, plan: VaccinePlanSettings) {
  return writeLocal(store, () =>
    updateAndMark(store, id, (draft) => {
      Object.assign(draft, { vaccinePlan: plan })
      draft.updatedAt = Date.now()
    }),
  )
}

export function setBabyArchived(store: LocalStore, id: string, archived: boolean) {
  const now = Date.now()
  return writeLocal(store, () =>
    updateAndMark(store, id, (draft) => {
      Object.assign(draft, { archivedAt: archived ? now : null })
      draft.updatedAt = now
    }),
  )
}

/** Deletes a baby for everyone; its records go too (on the server when the deletion syncs). */
export function deleteBaby(store: LocalStore, id: string) {
  const now = Date.now()
  return writeLocal(store, () => {
    updateAndMark(store, id, (draft) => {
      Object.assign(draft, { deletedAt: now })
      draft.updatedAt = now
    })
    purgeBabyEvents(store, id)
  })
}
