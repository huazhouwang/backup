import { newId } from '@lullabo/shared'
import { testBaby } from '@lullabo/shared/testing'
import { SchemaValidationError } from '@tanstack/db'
import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'

import { openLocalStore } from '../db/local-store'
import { markDirty, writeLocal } from './local'

const baby = () => {
  const now = Date.now()
  return testBaby({ id: newId(now), createdAt: now, updatedAt: now })
}

const granted = () => Promise.resolve(true)

describe('writeLocal', () => {
  it('stores a record together with its outbox entry', async () => {
    const idbFactory = new IDBFactory()
    const store = await openLocalStore({ idbFactory, requestPersistence: granted })
    await Promise.all([store.babies.preload(), store.outbox.preload()])
    const record = baby()

    const transaction = writeLocal(store, () => {
      store.babies.insert(record)
      markDirty(store, 'babies', record)
    })
    // Shown at once, before it is stored.
    expect(store.babies.has(record.id)).toBe(true)
    expect(store.outbox.has(`babies:${record.id}`)).toBe(true)
    await transaction.isPersisted.promise

    const reopened = await openLocalStore({ idbFactory, requestPersistence: granted })
    expect((await reopened.babies.toArrayWhenReady()).map((b) => b.id)).toEqual([record.id])
    expect((await reopened.outbox.toArrayWhenReady()).map((e) => e.id)).toEqual([record.id])
  })

  it('rolls back the record and its outbox entry together', async () => {
    const store = await openLocalStore({
      idbFactory: new IDBFactory(),
      requestPersistence: granted,
    })
    await Promise.all([store.babies.preload(), store.outbox.preload()])
    const record = baby()

    expect(() =>
      writeLocal(store, () => {
        store.babies.insert(record)
        markDirty(store, 'babies', record)
        // Fails schema validation, so nothing in the change is kept.
        store.outbox.insert({ key: 'bad', table: 'babies', id: record.id, updatedAt: 'x' as never })
      }),
    ).toThrow(SchemaValidationError)
    expect(store.babies.has(record.id)).toBe(false)
    expect(store.outbox.size).toBe(0)
  })
})
