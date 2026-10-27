import type { Event } from '@lullabo/shared'

import type { LocalStore } from '../../db'
import { markDirty, writeLocal } from '../../sync/local'

/** New events belong to their baby's family, so they sync to the same people. */
export function addEvent(store: LocalStore, event: Event) {
  const familyId = store.babies.get(event.babyId)?.familyId ?? null
  const stamped = { ...event, familyId }
  return writeLocal(store, () => {
    store.events.insert(stamped)
    markDirty(store, 'events', stamped)
  })
}

/** Replaces an event with an updated version built by the pure helpers in records.ts. */
export function saveEvent(store: LocalStore, next: Event) {
  return writeLocal(store, () => {
    store.events.update(next.id, (draft) => {
      Object.assign(draft, next)
    })
    markDirty(store, 'events', next)
  })
}
