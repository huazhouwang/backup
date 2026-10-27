import {
  type Baby,
  type Event,
  type PullResponse,
  type PushRequest,
  type PushResponse,
  SYNC_PUSH_LIMIT,
  babySchema,
  eventSchema,
} from '@lullabo/shared'

import type { LocalStore } from '../db'
import { applyAccess } from './access'
import {
  clearDirty,
  getCursor,
  isDirty,
  purgeBabyEvents,
  removeLocal,
  setCursor,
  type SyncTable,
} from './local'

export interface SyncApi {
  push: (request: PushRequest) => Promise<PushResponse>
  pull: (cursor: string) => Promise<PullResponse>
}

export interface SyncResult {
  pushed: number
  pulled: number
  /** Pending changes the server refused; they are rolled back to the server's version. */
  rejected: { table: SyncTable; id: string; reason?: string }[]
}

/** Stops runaway loops if the server keeps reporting more pages. */
const MAX_PULL_PAGES = 200

/** Pushes up to one batch; returns whether another full batch may be waiting. */
async function pushOnce(store: LocalStore, api: SyncApi, result: SyncResult): Promise<boolean> {
  const request: PushRequest = { babies: [], events: [] }
  const sent = new Map<string, number>()
  for (const entry of store.outbox.toArray) {
    if (sent.size >= SYNC_PUSH_LIMIT) break
    if (entry.table === 'babies') {
      const baby = store.babies.get(entry.id)
      if (!baby) store.outbox.delete(entry.key)
      // Records created while signed out get their family when the data is claimed (#24).
      else if (baby.familyId !== null) {
        request.babies.push(baby)
        sent.set(entry.key, baby.updatedAt)
      }
    } else {
      const event = store.events.get(entry.id)
      if (!event) store.outbox.delete(entry.key)
      else if (event.familyId !== null) {
        request.events.push(event)
        sent.set(entry.key, event.updatedAt)
      }
    }
  }
  if (sent.size === 0) return false

  const response = await api.push(request)
  for (const table of ['babies', 'events'] as const) {
    for (const item of response[table]) {
      const pushedAt = sent.get(`${table}:${item.id}`)
      if (pushedAt === undefined) continue
      // accepted: stored. stale: the server's newer version arrives with the pull.
      // rejected: will never be stored as sent, so retrying is pointless.
      clearDirty(store, table, item.id, pushedAt)
      if (item.status === 'accepted') result.pushed += 1
      if (item.status === 'rejected') {
        result.rejected.push({ table, id: item.id, reason: item.reason })
        // Drop the refused version; the full pull below restores the server's copy, if any.
        removeLocal(store, table, item.id)
      }
    }
  }
  return sent.size === SYNC_PUSH_LIMIT
}

/**
 * Whether a server record should replace the local copy (last write wins). On a tie a
 * pending local change is kept: it is pushed next and the server accepts ties, so both sides
 * converge on it.
 */
function shouldApply(
  store: LocalStore,
  table: SyncTable,
  local: Baby | Event | undefined,
  remote: Baby | Event,
) {
  return !(local && isDirty(store, table, remote.id) && local.updatedAt >= remote.updatedAt)
}

/**
 * Records this version cannot read (e.g. an event type added in a newer version) are
 * skipped instead of failing the whole sync; they arrive again after an update.
 */
function readable(schema: typeof babySchema | typeof eventSchema, record: unknown): boolean {
  return schema.safeParse(record).success
}

function applyRemoteBaby(store: LocalStore, remote: Baby): boolean {
  if (!readable(babySchema, remote)) return false
  const local = store.babies.get(remote.id)
  if (!shouldApply(store, 'babies', local, remote)) return false
  if (local) store.babies.update(remote.id, (draft) => void Object.assign(draft, remote))
  else store.babies.insert(remote)
  // The server copy is at least as new, so any pending local change is obsolete.
  clearDirty(store, 'babies', remote.id, remote.updatedAt)
  // The server already removed a deleted baby's records; do the same here.
  if (remote.deletedAt !== null) purgeBabyEvents(store, remote.id)
  return true
}

function applyRemoteEvent(store: LocalStore, remote: Event): boolean {
  if (!readable(eventSchema, remote)) return false
  const local = store.events.get(remote.id)
  if (!shouldApply(store, 'events', local, remote)) return false
  if (local) store.events.update(remote.id, (draft) => void Object.assign(draft, remote))
  else store.events.insert(remote)
  clearDirty(store, 'events', remote.id, remote.updatedAt)
  return true
}

async function pullAll(store: LocalStore, api: SyncApi, result: SyncResult) {
  // Rolled-back records may be older than the cursor; start over to get them back.
  if (result.rejected.length > 0) setCursor(store, '')
  let cursor = getCursor(store)
  let restarted = false
  for (let page = 0; page < MAX_PULL_PAGES; page += 1) {
    // Each page needs the cursor returned by the previous one.
    // oxlint-disable-next-line no-await-in-loop
    const response = await api.pull(cursor)
    // Newly shared families or babies have records older than the cursor: pull from the start.
    if (applyAccess(store, response.access) && cursor !== '' && !restarted) {
      restarted = true
      cursor = ''
      setCursor(store, cursor)
      continue
    }
    for (const baby of response.babies) if (applyRemoteBaby(store, baby)) result.pulled += 1
    for (const event of response.events) if (applyRemoteEvent(store, event)) result.pulled += 1
    cursor = response.cursor
    setCursor(store, cursor)
    if (!response.hasMore) return
  }
}

/** One full round: push pending changes (in batches), then pull everything new. */
export async function syncOnce(store: LocalStore, api: SyncApi): Promise<SyncResult> {
  const result: SyncResult = { pushed: 0, pulled: 0, rejected: [] }
  // Batches go one at a time so the server sees changes in order.
  // oxlint-disable-next-line no-await-in-loop
  while (await pushOnce(store, api, result)) {
    // Keep pushing while full batches remain.
  }
  await pullAll(store, api, result)
  return result
}
