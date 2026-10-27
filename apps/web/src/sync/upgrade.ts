import { type Event, recordKind } from '@lullabo/shared'

import type { LocalStore } from '../db/local-store'
import { isDirty, markDirty, setMeta, writeLocal } from './local'

const UPGRADED_KEY = 'records-v2'

/** Kinds that gained timers in #170; until then no end meant "duration not recorded". */
const NOW_TIMED = new Set(['bottle', 'solids', 'pumping'])

const needsEnd = (event: Event) =>
  event.endAt === null && event.deletedAt === null && NOW_TIMED.has(recordKind(event))

/**
 * Once per device: bottles, solids and pumping saved before they could run as timers get
 * their start as their end, so they don't show as running. Records the server already has
 * are changed the same way there (migration 0011) and only updated here; records not synced
 * yet (signed out, or waiting to upload) are changed as a local edit so the new end uploads.
 */
export function upgradeRecords(store: LocalStore, now: number = Date.now()) {
  if (store.meta.get(UPGRADED_KEY)?.value === true) return
  const stale = [...store.events.values()].filter(needsEnd)
  if (stale.length > 0)
    writeLocal(store, () => {
      for (const event of stale) {
        const pending = event.familyId === null || isDirty(store, 'events', event.id)
        const next = { ...event, endAt: event.startAt, updatedAt: pending ? now : event.updatedAt }
        store.events.update(event.id, (draft) => {
          draft.endAt = next.endAt
          draft.updatedAt = next.updatedAt
        })
        if (pending) markDirty(store, 'events', next)
      }
    })
  setMeta(store, UPGRADED_KEY, true)
}
