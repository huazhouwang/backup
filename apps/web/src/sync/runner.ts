import { type FamilySummary, canAddBabies } from '@lullabo/shared'

import type { LocalStore } from '../db'
import { HttpError, apiFetch } from '../lib/api'
import { createStore, useStore } from '../lib/store'
import { m } from '../paraglide/messages.js'
import { type SyncApi, syncOnce } from './engine'
import { httpSyncApi } from './http'
import {
  type SyncAccount,
  claimLocalData,
  getAccess,
  getAccount,
  setAccount,
  unclaimedCount,
} from './local'

/** Name of the family created for a user's own babies, e.g. 王丽的家. */
export const ownFamilyName = (user: { name: string }) =>
  m.familyDefaultName({ name: user.name.trim() || m.familyMemberYou() })

export type SyncPhase = 'signed-out' | 'idle' | 'syncing' | 'offline' | 'error' | 'unauthorized'

export interface SyncState {
  phase: SyncPhase
  lastSyncedAt?: number
  /** The latest round in which the server refused changes (they were rolled back). */
  rejected?: { count: number; at: number }
}

const LOCAL_CHANGE_DELAY_MS = 3_000
const INTERVAL_MS = 60_000

const syncState = createStore<SyncState>({ phase: 'signed-out' })
const setState = syncState.set

export const useSyncState = (): SyncState => useStore(syncState)
/** The sync state now, for code that runs outside render (e.g. after awaiting a round). */
export const currentSyncState = (): SyncState => syncState.get()

let running: Promise<void> | null = null
let again = false
let current: { store: LocalStore; api: SyncApi } | null = null

/** Runs one sync round; concurrent requests are coalesced into one follow-up round. */
export function requestSync(): Promise<void> {
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    do {
      again = false
      // Rounds must not overlap; a request during a round triggers exactly one more.
      // oxlint-disable-next-line no-await-in-loop
      await runRound()
    } while (again)
  })().finally(() => {
    running = null
  })
  return running
}

/**
 * Babies added for "a new family of my own" (or before the account had any family) wait
 * without a family; the first sync creates one named after the user and moves them in.
 */
async function fileUnclaimed(store: LocalStore, account: SyncAccount) {
  if (unclaimedCount(store) === 0) return
  const family = await apiFetch<FamilySummary>('/api/families', {
    method: 'POST',
    body: JSON.stringify({ name: ownFamilyName({ name: account.userName ?? '' }) }),
  })
  await claimLocalData(store, family.id).isPersisted.promise
  setAccount(store, { ...account, familyId: family.id })
}

/** After leaving or deleting the default family, new babies go to another one the user manages. */
function keepDefaultFamily(store: LocalStore) {
  const account = getAccount(store)
  const access = getAccess(store)
  if (!account?.familyId || !access || access.some((f) => f.id === account.familyId)) return
  setAccount(store, { ...account, familyId: access.find(canAddBabies)?.id ?? null })
}

async function runRound() {
  if (!current) return
  const { store, api } = current
  const account = getAccount(store)
  if (!account) {
    setState({ phase: 'signed-out' })
    return
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    setState({ ...syncState.get(), phase: 'offline' })
    return
  }
  setState({ ...syncState.get(), phase: 'syncing' })
  try {
    await fileUnclaimed(store, account)
    const result = await syncOnce(store, api)
    keepDefaultFamily(store)
    const at = Date.now()
    if (result.rejected.length > 0) console.warn('Sync rejected changes', result.rejected)
    setState({
      phase: 'idle',
      lastSyncedAt: at,
      rejected:
        result.rejected.length > 0
          ? { count: result.rejected.length, at }
          : syncState.get().rejected,
    })
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      setState({ ...syncState.get(), phase: 'unauthorized' })
    } else {
      console.warn('Sync failed', error)
      setState({ ...syncState.get(), phase: navigator.onLine ? 'error' : 'offline' })
    }
  }
}

const now = () => void requestSync()

/**
 * Starts background sync: on start, when coming back online or to the foreground, shortly
 * after local changes, and periodically while visible. Returns a stop function.
 */
export function startSync(store: LocalStore, api: SyncApi = httpSyncApi): () => void {
  current = { store, api }
  let timer: ReturnType<typeof setTimeout> | undefined

  const soon = () => {
    clearTimeout(timer)
    timer = setTimeout(() => void requestSync(), LOCAL_CHANGE_DELAY_MS)
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') now()
  }

  const outbox = store.outbox.subscribeChanges((changes) => {
    if (changes.some((change) => change.type !== 'delete')) soon()
  })
  const interval = setInterval(() => {
    if (document.visibilityState === 'visible') now()
  }, INTERVAL_MS)
  window.addEventListener('online', now)
  document.addEventListener('visibilitychange', onVisible)
  // iOS does not always report visibility when an installed app comes back (e.g. after Siri).
  window.addEventListener('focus', now)
  now()

  return () => {
    clearTimeout(timer)
    clearInterval(interval)
    outbox.unsubscribe()
    window.removeEventListener('online', now)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('focus', now)
    current = null
  }
}
