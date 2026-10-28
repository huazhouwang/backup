import { type Baby, newId } from '@lullabo/shared'
import { testBaby } from '@lullabo/shared/testing'
import {
  SchemaValidationError,
  createCollection,
  createIndexedDB,
  indexedDBCollectionOptions,
} from '@tanstack/db'
import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'

import { openLocalStore } from './local-store'

const baby = () => {
  const now = Date.now()
  return testBaby({ id: newId(now), createdAt: now, updatedAt: now })
}

const granted = () => Promise.resolve(true)

describe('openLocalStore', () => {
  it('persists records across reopening the database', async () => {
    const idbFactory = new IDBFactory()
    const first = await openLocalStore({ idbFactory, requestPersistence: granted })
    expect(first.mode).toBe('persistent')

    await first.babies.preload()
    const record = baby()
    await first.babies.insert(record).isPersisted.promise

    const second = await openLocalStore({ idbFactory, requestPersistence: granted })
    const babies = await second.babies.toArrayWhenReady()
    expect(babies.map((b) => b.id)).toEqual([record.id])
  })

  it('keeps existing data when upgrading from the version 1 database', async () => {
    const idbFactory = new IDBFactory()
    // Version 1 shipped with only the babies and events stores.
    const v1 = await createIndexedDB({
      name: 'bobo',
      version: 1,
      stores: ['babies', 'events'],
      idbFactory,
    })
    const babies = createCollection(
      indexedDBCollectionOptions<Baby, string>({ db: v1, name: 'babies', getKey: (b) => b.id }),
    )
    await babies.preload()
    const record = baby()
    await babies.insert(record).isPersisted.promise
    v1.close()

    const upgraded = await openLocalStore({ idbFactory, requestPersistence: granted })
    expect((await upgraded.babies.toArrayWhenReady()).map((b) => b.id)).toEqual([record.id])
    await upgraded.outbox.preload()
    expect(upgraded.outbox.size).toBe(0)
  })

  it('rejects records that fail schema validation', async () => {
    const store = await openLocalStore({
      idbFactory: new IDBFactory(),
      requestPersistence: granted,
    })
    await store.babies.preload()
    expect(() => store.babies.insert({ ...baby(), name: '' })).toThrow(SchemaValidationError)
  })

  it('reports best-effort storage when persistence is not granted', async () => {
    const store = await openLocalStore({
      idbFactory: new IDBFactory(),
      requestPersistence: () => Promise.resolve(false),
    })
    expect(store.mode).toBe('best-effort')
  })

  it('falls back to memory when IndexedDB cannot be opened', async () => {
    const broken = Object.assign(new IDBFactory(), {
      open: () => {
        throw new Error('IndexedDB disabled')
      },
    })
    const store = await openLocalStore({ idbFactory: broken })
    expect(store.mode).toBe('memory')

    const record = baby()
    store.babies.insert(record)
    expect(store.babies.get(record.id)?.name).toBe('小宝')
  })
})
