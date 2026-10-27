import { type FamilySummary, newId } from '@lullabo/shared'
import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'

import { type LocalStore, openLocalStore } from '../../db/local-store'
import { claimLocalData, getAccount, getCursor, setCursor, unclaimedCount } from '../../sync/local'
import { createBaby } from '../babies/actions'
import { addEvent } from '../events/actions'
import { logDiaper } from '../events/records'
import { type AccountApi, completeConnect, connectAccount, disconnectLocal } from './account'

const user = { id: 'user-1', name: '家长', email: 'a@example.com', image: null }
const familyName = (u: { name: string }) => `${u.name}的家`

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
  return store
}

function fakeApi(existing: FamilySummary[] = [], signedIn = true) {
  const created: FamilySummary[] = []
  const api: AccountApi = {
    me: async () => (signedIn ? user : null),
    families: async () => [...existing, ...created],
    createFamily: async (name) => {
      const family: FamilySummary = { id: newId(), name, role: 'owner', babyIds: null }
      created.push(family)
      return family
    },
  }
  return { api, created }
}

const input = {
  name: '小宝',
  birthDate: '2026-09-30',
  sex: 'unspecified',
  avatarColor: 'green',
} as const

describe('claiming local data', () => {
  it('moves signed-out records into the family and queues them', async () => {
    const store = await device()
    const baby = createBaby(store, input)
    addEvent(store, logDiaper(baby.id, Date.now(), 'wet'))
    expect(unclaimedCount(store)).toBe(1)

    const familyId = newId()
    claimLocalData(store, familyId)
    expect(store.babies.get(baby.id)?.familyId).toBe(familyId)
    expect(store.events.toArray[0]?.familyId).toBe(familyId)
    expect(unclaimedCount(store)).toBe(0)
    expect(store.outbox.size).toBe(2)
  })
})

describe('connectAccount', () => {
  it('creates a family for a new account and claims the local records', async () => {
    const store = await device()
    createBaby(store, input)
    const { api, created } = fakeApi()
    const result = await connectAccount(store, api, familyName)
    expect(result.status).toBe('connected')
    expect(created.map((f) => f.name)).toEqual(['家长的家'])
    expect(getAccount(store)).toEqual({
      userId: user.id,
      userName: '家长',
      familyId: created[0]?.id,
    })
    expect(unclaimedCount(store)).toBe(0)
  })

  it('joins the existing family on a device without local records', async () => {
    const store = await device()
    const family: FamilySummary = { id: newId(), name: '我们家', role: 'owner', babyIds: null }
    const { api, created } = fakeApi([family])
    expect(await connectAccount(store, api, familyName)).toEqual({ status: 'connected', family })
    expect(created).toEqual([])
    expect(getAccount(store)?.familyId).toBe(family.id)
  })

  it('creates no family for an account without one when the device has no records', async () => {
    const store = await device()
    const { api, created } = fakeApi()
    expect(await connectAccount(store, api, familyName)).toEqual({
      status: 'connected',
      family: undefined,
    })
    expect(created).toEqual([])
    expect(getAccount(store)?.familyId).toBeNull()
  })

  it('defaults new babies to a family the user manages, not one they only help with', async () => {
    const store = await device()
    const helping: FamilySummary = { id: newId(), name: '张家', role: 'caregiver', babyIds: null }
    const own: FamilySummary = { id: newId(), name: '我家', role: 'owner', babyIds: null }
    await connectAccount(store, fakeApi([helping, own]).api, familyName)
    expect(getAccount(store)?.familyId).toBe(own.id)
  })

  it('asks the user when both the account and the device have data', async () => {
    const store = await device()
    createBaby(store, input)
    const family: FamilySummary = { id: newId(), name: '我们家', role: 'owner', babyIds: null }
    const result = await connectAccount(store, fakeApi([family]).api, familyName)
    expect(result).toMatchObject({ status: 'choose', families: [family] })
    expect(getAccount(store)).toBeUndefined()

    completeConnect(store, user, family)
    expect(getAccount(store)?.familyId).toBe(family.id)
    expect(unclaimedCount(store)).toBe(0)
  })

  it('does nothing while signed out', async () => {
    const store = await device()
    expect(await connectAccount(store, fakeApi([], false).api, familyName)).toEqual({
      status: 'signed-out',
    })
  })
})

describe('disconnectLocal', () => {
  it('forgets the account and cursor but can keep the records', async () => {
    const store = await device()
    createBaby(store, input)
    await connectAccount(store, fakeApi().api, familyName)
    setCursor(store, 'abc')
    disconnectLocal(store, false)
    expect(getAccount(store)).toBeUndefined()
    expect(getCursor(store)).toBe('')
    expect(store.babies.size).toBe(1)
  })

  it('can clear all local records', async () => {
    const store = await device()
    const baby = createBaby(store, input)
    addEvent(store, logDiaper(baby.id, Date.now(), 'wet'))
    disconnectLocal(store, true)
    expect(store.babies.size).toBe(0)
    expect(store.events.size).toBe(0)
    expect(store.outbox.size).toBe(0)
  })
})
