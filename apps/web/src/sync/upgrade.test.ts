import { type Event, newId } from '@lullabo/shared'
import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'

import { openLocalStore } from '../db/local-store'
import { logBottle, startSleep } from '../features/events/records'
import { isDirty, markDirty } from './local'
import { upgradeRecords } from './upgrade'

const T0 = Date.UTC(2026, 9, 1, 2)
const BABY = newId(T0)
const FAMILY = newId(T0)

/** A bottle as apps before #170 saved it: no end. */
const legacyBottle = (familyId: string | null): Event => ({
  ...logBottle(BABY, T0, 90, 'formula', T0),
  familyId,
  endAt: null,
})

describe('upgradeRecords', () => {
  it('ends earlier bottles once, uploading only those not synced yet', async () => {
    const store = await openLocalStore({ idbFactory: new IDBFactory() })
    const synced = legacyBottle(FAMILY)
    const pending = legacyBottle(FAMILY)
    const sleeping = startSleep(BABY, T0)
    store.events.insert([synced, pending, sleeping])
    markDirty(store, 'events', pending)

    upgradeRecords(store, T0 + 1000)

    expect(store.events.get(synced.id)).toMatchObject({ endAt: T0, updatedAt: synced.updatedAt })
    expect(isDirty(store, 'events', synced.id)).toBe(false)
    expect(store.events.get(pending.id)).toMatchObject({ endAt: T0, updatedAt: T0 + 1000 })
    expect(store.outbox.get(`events:${pending.id}`)?.updatedAt).toBe(T0 + 1000)
    expect(store.events.get(sleeping.id)?.endAt).toBeNull()

    // Bottles started as timers after the upgrade keep running.
    const running = legacyBottle(FAMILY)
    store.events.insert(running)
    upgradeRecords(store, T0 + 2000)
    expect(store.events.get(running.id)?.endAt).toBeNull()
  })
})
