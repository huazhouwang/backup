import {
  type Baby,
  type Event,
  type FamilySummary,
  type PullResponse,
  type PushItemResult,
  type PushRequest,
  type PushResponse,
  newId,
} from '@lullabo/shared'
import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'

import { type LocalStore, openLocalStore } from '../db/local-store'
import { createBaby, updateBaby } from '../features/babies/actions'
import { addEvent, saveEvent } from '../features/events/actions'
import { logDiaper } from '../features/events/records'
import { type SyncApi, syncOnce } from './engine'
import { getAccount, getCursor, markDirty, setAccount } from './local'

const FAMILY = newId()
const OWNER: FamilySummary = { id: FAMILY, name: '家', role: 'owner', babyIds: null }

/** In-memory server with the same semantics as the real API: LWW, seq-ordered pulls. */
function createFakeServer(pageSize = 1000) {
  let seq = 0
  const rows = {
    babies: new Map<string, { seq: number; record: Baby }>(),
    events: new Map<string, { seq: number; record: Event }>(),
  }
  const rejectIds = new Set<string>()
  const state = { access: [OWNER], pulls: [] as string[] }

  function write<T extends Baby | Event>(
    map: Map<string, { seq: number; record: T }>,
    items: T[],
  ): PushItemResult[] {
    return items.map((item) => {
      if (rejectIds.has(item.id)) return { id: item.id, status: 'rejected', reason: 'forbidden' }
      const current = map.get(item.id)
      if (current && current.record.updatedAt > item.updatedAt)
        return { id: item.id, status: 'stale' }
      map.set(item.id, { seq, record: structuredClone(item) })
      return { id: item.id, status: 'accepted' }
    })
  }

  const api: SyncApi = {
    async push(request: PushRequest): Promise<PushResponse> {
      seq += 1
      return {
        babies: write(rows.babies, request.babies),
        events: write(rows.events, request.events),
      }
    },
    async pull(cursor: string): Promise<PullResponse> {
      state.pulls.push(cursor)
      const after = Number(cursor || 0)
      const page = <T>(map: Map<string, { seq: number; record: T }>) =>
        [...map.values()].filter((row) => row.seq > after).toSorted((a, b) => a.seq - b.seq)
      const babies = page(rows.babies)
      const events = page(rows.events)
      // Page by seq for simplicity: return whole seq groups up to pageSize records.
      const seqs = [...new Set([...babies, ...events].map((row) => row.seq))].toSorted(
        (a, b) => a - b,
      )
      let count = 0
      let last = after
      for (const s of seqs) {
        const n = [...babies, ...events].filter((row) => row.seq === s).length
        if (count > 0 && count + n > pageSize) break
        count += n
        last = s
      }
      return {
        babies: babies.filter((row) => row.seq <= last).map((row) => structuredClone(row.record)),
        events: events.filter((row) => row.seq <= last).map((row) => structuredClone(row.record)),
        access: structuredClone(state.access),
        cursor: String(last),
        hasMore: seqs.some((s) => s > last),
      }
    },
  }
  return { api, rows, rejectIds, state, pushes: () => seq }
}

async function device(): Promise<LocalStore> {
  const store = await openLocalStore({
    idbFactory: new IDBFactory(),
    requestPersistence: async () => true,
  })
  await Promise.all([
    store.babies.preload(),
    store.events.preload(),
    store.outbox.preload(),
    store.meta.preload(),
  ])
  setAccount(store, { userId: 'user-1', familyId: FAMILY })
  return store
}

const input = {
  name: '小宝',
  birthDate: '2026-09-30',
  sex: 'unspecified',
  avatarColor: 'green',
} as const

/** Polls the raw database until writes made through the collections have been persisted. */
async function waitForStoreCount(idbFactory: IDBFactory, storeName: string, count: number) {
  const countOnce = () =>
    new Promise<number>((resolve, reject) => {
      const open = idbFactory.open('bobo')
      open.addEventListener('error', () => reject(open.error))
      open.addEventListener('success', () => {
        const db = open.result
        const request = db.transaction(storeName).objectStore(storeName).count()
        request.addEventListener('success', () => {
          db.close()
          resolve(request.result)
        })
        request.addEventListener('error', () => reject(request.error))
      })
    })
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if ((await countOnce()) >= count) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`${storeName} never reached ${count} records`)
}

describe('syncOnce', () => {
  it('sees records persisted in an earlier session (collections load before use)', async () => {
    const idbFactory = new IDBFactory()
    const first = await openLocalStore({ idbFactory, requestPersistence: async () => true })
    setAccount(first, { userId: 'user-1', familyId: FAMILY })
    const baby = createBaby(first, input)
    const event = logDiaper(baby.id, Date.now(), 'wet')
    addEvent(first, event)
    await waitForStoreCount(idbFactory, 'outbox', 2)

    // Next app start: nothing has queried the collections yet.
    const reopened = await openLocalStore({ idbFactory, requestPersistence: async () => true })
    const server = createFakeServer()
    await syncOnce(reopened, server.api)
    expect(server.rows.events.has(event.id)).toBe(true)
    expect(reopened.outbox.size).toBe(0)
  })

  it('moves records from one device to another and empties the outbox', async () => {
    const server = createFakeServer()
    const a = await device()
    const b = await device()
    const baby = createBaby(a, input)
    addEvent(a, logDiaper(baby.id, Date.now(), 'wet'))
    expect(a.outbox.size).toBe(2)

    expect(await syncOnce(a, server.api)).toMatchObject({ pushed: 2 })
    expect(a.outbox.size).toBe(0)

    await syncOnce(b, server.api)
    expect(b.babies.get(baby.id)?.familyId).toBe(FAMILY)
    expect(b.events.toArray).toHaveLength(1)
    expect(b.outbox.size).toBe(0)
  })

  it('converges on the newest version after concurrent edits', async () => {
    const server = createFakeServer()
    const a = await device()
    const b = await device()
    const baby = createBaby(a, input)
    await syncOnce(a, server.api)
    await syncOnce(b, server.api)

    // A edits first, B later; B's version must win on both devices.
    const edit = (store: LocalStore, name: string, updatedAt: number) => {
      store.babies.update(baby.id, (d) => Object.assign(d, { name, updatedAt }))
      markDirty(store, 'babies', { ...baby, name, updatedAt })
    }
    edit(a, 'A 改的', baby.updatedAt + 10)
    edit(b, 'B 改的', baby.updatedAt + 20)

    await syncOnce(b, server.api)
    await syncOnce(a, server.api) // A's push is stale; the pull brings B's version
    expect(a.babies.get(baby.id)?.name).toBe('B 改的')
    expect(b.babies.get(baby.id)?.name).toBe('B 改的')
    expect(a.outbox.size).toBe(0)
  })

  it('keeps a newer pending local change over an older remote version', async () => {
    const a = await device()
    const baby = createBaby(a, input)
    updateBaby(a, baby.id, { ...input, name: '本地更新' })
    const offlinePush: SyncApi = {
      // The push fails to reach the server, but a pull with an older copy succeeds.
      push: async () => ({ babies: [], events: [] }),
      pull: async () => ({
        babies: [{ ...baby, name: '旧的远端' }],
        events: [],
        access: [OWNER],
        cursor: '1',
        hasMore: false,
      }),
    }
    await syncOnce(a, offlinePush)
    expect(a.babies.get(baby.id)?.name).toBe('本地更新')
    expect(a.outbox.size).toBe(1)
  })

  it('keeps changes made while a push is in flight', async () => {
    const server = createFakeServer()
    const a = await device()
    const baby = createBaby(a, input)
    const event = logDiaper(baby.id, Date.now(), 'wet')
    addEvent(a, event)
    const api: SyncApi = {
      ...server.api,
      async push(request) {
        const response = await server.api.push(request)
        // The user edits the event before the push is acknowledged.
        saveEvent(a, { ...a.events.get(event.id)!, note: '后来补充', updatedAt: Date.now() + 1000 })
        return response
      },
    }
    await syncOnce(a, api)
    expect(a.outbox.has(`events:${event.id}`)).toBe(true)
    await syncOnce(a, server.api)
    expect(server.rows.events.get(event.id)?.record.note).toBe('后来补充')
  })

  it('holds back records without a family without blocking the rest', async () => {
    const server = createFakeServer()
    const a = await device()
    setAccount(a, undefined)
    const unclaimed = createBaby(a, input) // familyId null while signed out
    setAccount(a, { userId: 'user-1', familyId: FAMILY })
    const claimed = createBaby(a, { ...input, name: '有家庭' })
    await syncOnce(a, server.api)
    expect(server.rows.babies.has(claimed.id)).toBe(true)
    expect(server.rows.babies.has(unclaimed.id)).toBe(false)
    expect(a.outbox.has(`babies:${unclaimed.id}`)).toBe(true)
  })

  it('reports rejected changes and rolls them back to the server version', async () => {
    const server = createFakeServer()
    const a = await device()
    const baby = createBaby(a, input)
    const refused = createBaby(a, { ...input, name: '不允许' })
    server.rejectIds.add(refused.id)
    await syncOnce(a, server.api)
    expect(a.babies.has(refused.id)).toBe(false)

    server.rejectIds.add(baby.id)
    updateBaby(a, baby.id, { ...input, name: '没有权限改' })
    const result = await syncOnce(a, server.api)
    expect(result.rejected).toEqual([{ table: 'babies', id: baby.id, reason: 'forbidden' }])
    expect(a.babies.get(baby.id)?.name).toBe(input.name)
    expect(a.outbox.size).toBe(0)
  })

  it('removes local data the user lost access to', async () => {
    const server = createFakeServer()
    const a = await device()
    const kept = createBaby(a, input)
    const hidden = createBaby(a, { ...input, name: '老二' })
    addEvent(a, logDiaper(hidden.id, Date.now(), 'wet'))
    addEvent(a, logDiaper(kept.id, Date.now(), 'wet'))
    await syncOnce(a, server.api)

    server.state.access = [{ ...OWNER, role: 'caregiver', babyIds: [kept.id] }]
    await syncOnce(a, server.api)
    expect(a.babies.toArray.map((b) => b.id)).toEqual([kept.id])
    expect(a.events.toArray.every((event) => event.babyId === kept.id)).toBe(true)

    // Removed from the family: its data leaves the device, local-only records stay.
    setAccount(a, undefined)
    const local = createBaby(a, { ...input, name: '本地' })
    setAccount(a, { userId: 'user-1', familyId: FAMILY })
    server.state.access = []
    await syncOnce(a, server.api)
    expect(a.babies.toArray.map((b) => b.id)).toEqual([local.id])
    expect(a.events.size).toBe(0)
  })

  it('pulls from the start when access grows', async () => {
    const server = createFakeServer()
    const a = await device()
    const b = await device()
    const first = createBaby(a, input)
    const second = createBaby(a, { ...input, name: '老二' })
    await syncOnce(a, server.api)

    server.state.access = [{ ...OWNER, role: 'viewer', babyIds: [first.id] }]
    // The fake server does not filter by scope; drop the hidden baby like the real one would.
    await syncOnce(b, server.api)
    b.babies.delete(second.id)
    expect(getCursor(b)).not.toBe('')

    server.state.access = [{ ...OWNER, role: 'viewer', babyIds: null }]
    server.state.pulls.length = 0
    await syncOnce(b, server.api)
    expect(server.state.pulls).toContain('')
    expect(b.babies.has(second.id)).toBe(true)
  })

  it('moves new records to another family when the account leaves its family', async () => {
    const server = createFakeServer()
    const a = await device()
    const other: FamilySummary = { id: newId(), name: '外婆家', role: 'admin', babyIds: null }
    server.state.access = [other]
    await syncOnce(a, server.api)
    expect(getAccount(a)?.familyId).toBe(other.id)
  })

  it('skips records it cannot read without failing the sync', async () => {
    const a = await device()
    const baby = createBaby(a, input)
    const known = logDiaper(baby.id, Date.now(), 'wet')
    const api: SyncApi = {
      push: async (request) => ({
        babies: request.babies.map((b) => ({ id: b.id, status: 'accepted' })),
        events: [],
      }),
      pull: async () => ({
        babies: [],
        events: [
          { ...known, familyId: FAMILY },
          { ...known, id: newId(), familyId: FAMILY, type: 'future-type' } as unknown as Event,
        ],
        access: [OWNER],
        cursor: '1',
        hasMore: false,
      }),
    }
    const result = await syncOnce(a, api)
    expect(result.pulled).toBe(1)
    expect(a.events.toArray.map((event) => event.id)).toEqual([known.id])
  })

  it('pushes large backlogs in batches and pages through pulls', async () => {
    const server = createFakeServer(200)
    const a = await device()
    const b = await device()
    const baby = createBaby(a, input)
    for (let i = 0; i < 620; i += 1) addEvent(a, logDiaper(baby.id, Date.now() - i * 1000, 'wet'))
    await syncOnce(a, server.api)
    expect(server.pushes()).toBe(2)
    expect(a.outbox.size).toBe(0)
    await syncOnce(b, server.api)
    expect(b.events.size).toBe(620)
  })
})
