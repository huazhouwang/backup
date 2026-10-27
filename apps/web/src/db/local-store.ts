import { type Baby, type Event, babySchema, eventSchema } from '@lullabo/shared'
import {
  BasicIndex,
  type Collection,
  type PendingMutation,
  createCollection,
  createIndexedDB,
  indexedDBCollectionOptions,
  localOnlyCollectionOptions,
} from '@tanstack/db'
import { z } from 'zod'

/** From when the app was called Bobo; a new name would leave the records behind. */
const DB_NAME = 'bobo'
/** Bump when adding object stores. */
const DB_VERSION = 2
const STORES = ['babies', 'events', 'outbox', 'meta'] as const

/** A local change waiting to be pushed; `updatedAt` is the version that was changed. */
export const outboxEntrySchema = z.object({
  key: z.string(),
  table: z.enum(['babies', 'events']),
  id: z.string(),
  updatedAt: z.number(),
})
export type OutboxEntry = z.infer<typeof outboxEntrySchema>

/** Small key-value records, e.g. the sync cursor and the signed-in account. */
export const metaEntrySchema = z.object({ key: z.string(), value: z.unknown() })
export type MetaEntry = z.infer<typeof metaEntrySchema>

/**
 * - `persistent`: IndexedDB, and the browser agreed not to evict it under storage pressure.
 * - `best-effort`: IndexedDB, but the browser may evict it (e.g. a non-installed web app on iOS).
 * - `memory`: IndexedDB is unavailable (some private modes); data is lost on reload.
 */
export type StorageMode = 'persistent' | 'best-effort' | 'memory'

export interface OpenLocalStoreOptions {
  /** Injected in tests. */
  idbFactory?: IDBFactory
  /** Injected in tests; defaults to `navigator.storage.persist`. */
  requestPersistence?: () => Promise<boolean>
}

function createIndexedDBCollections(db: Awaited<ReturnType<typeof createIndexedDB>>) {
  return {
    babies: createCollection(
      indexedDBCollectionOptions({
        db,
        name: 'babies',
        schema: babySchema,
        getKey: (baby) => baby.id,
      }),
    ),
    events: createCollection(
      indexedDBCollectionOptions({
        db,
        name: 'events',
        schema: eventSchema,
        getKey: (event) => event.id,
      }),
    ),
    outbox: createCollection(
      indexedDBCollectionOptions({
        db,
        name: 'outbox',
        schema: outboxEntrySchema,
        getKey: (entry) => entry.key,
      }),
    ),
    meta: createCollection(
      indexedDBCollectionOptions({
        db,
        name: 'meta',
        schema: metaEntrySchema,
        getKey: (entry) => entry.key,
      }),
    ),
  }
}

function createMemoryCollections() {
  return {
    babies: createCollection(
      localOnlyCollectionOptions({ schema: babySchema, getKey: (baby) => baby.id }),
    ),
    events: createCollection(
      localOnlyCollectionOptions({ schema: eventSchema, getKey: (event) => event.id }),
    ),
    outbox: createCollection(
      localOnlyCollectionOptions({ schema: outboxEntrySchema, getKey: (entry) => entry.key }),
    ),
    meta: createCollection(
      localOnlyCollectionOptions({ schema: metaEntrySchema, getKey: (entry) => entry.key }),
    ),
  }
}

/**
 * Pages read events by baby (today, stats, export) and by family (deleting it), so those
 * live queries look rows up in an index instead of scanning every record.
 */
function indexEvents(events: Collection<Event, string>) {
  events.createIndex((row) => row.babyId, { indexType: BasicIndex })
  events.createIndex((row) => row.familyId, { indexType: BasicIndex })
}

/** What both storage backends offer: keeping a manual transaction's changes on the device. */
export interface LocalUtils {
  [key: string]: unknown
  acceptMutations: (transaction: { mutations: PendingMutation[] }) => unknown
}

/** Backend-agnostic view of the collections; other utils differ per storage backend. */
export interface LocalStore {
  babies: Collection<Baby, string, LocalUtils>
  events: Collection<Event, string, LocalUtils>
  outbox: Collection<OutboxEntry, string, LocalUtils>
  meta: Collection<MetaEntry, string, LocalUtils>
  mode: StorageMode
}

async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}

/**
 * Opens the on-device store. This is the storage seam: the native (Capacitor) build will
 * provide SQLite-backed collections with the same shape (#47).
 */
export async function openLocalStore(options: OpenLocalStoreOptions = {}): Promise<LocalStore> {
  let db: Awaited<ReturnType<typeof createIndexedDB>>
  try {
    db = await createIndexedDB({
      name: DB_NAME,
      version: DB_VERSION,
      stores: STORES,
      idbFactory: options.idbFactory,
    })
  } catch (error) {
    console.warn('IndexedDB unavailable, falling back to in-memory storage', error)
    const collections = createMemoryCollections()
    indexEvents(collections.events)
    return { ...collections, mode: 'memory' }
  }

  const [persisted, collections] = await Promise.all([
    (options.requestPersistence ?? requestPersistentStorage)(),
    loadAll(createIndexedDBCollections(db)),
  ])
  indexEvents(collections.events)
  return { ...collections, mode: persisted ? 'persistent' : 'best-effort' }
}

/**
 * Collections load lazily, but sync and claiming read them directly (`get`, `toArray`), so
 * an unloaded collection would look empty and pending changes could be dropped. Load
 * everything before the store is handed out; the pages need all of it anyway.
 */
async function loadAll<T extends Omit<LocalStore, 'mode'>>(collections: T): Promise<T> {
  await Promise.all([
    collections.babies.preload(),
    collections.events.preload(),
    collections.outbox.preload(),
    collections.meta.preload(),
  ])
  return collections
}
