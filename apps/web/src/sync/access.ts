import {
  type Baby,
  type Event,
  type FamilyRole,
  type FamilySummary,
  canAddBabies,
  inBabyScope,
  isManager,
} from '@lullabo/shared'

import type { LocalStore } from '../db'
import { getAccess, getAccount, removeLocal, setAccess, setAccount } from './local'

const canSeeBaby = (family: FamilySummary, babyId: string) => inBabyScope(family.babyIds, babyId)

/** Whether `next` grants anything `previous` did not (a family, or babies in one). */
export function accessGrew(previous: FamilySummary[], next: FamilySummary[]): boolean {
  return next.some((family) => {
    const before = previous.find((item) => item.id === family.id)
    if (!before) return true
    if (before.babyIds === null) return false
    if (family.babyIds === null) return true
    return family.babyIds.some((id) => !before.babyIds?.includes(id))
  })
}

/**
 * Stores the account's current access and removes local copies of anything it no longer
 * covers (a family the user left or was removed from, or babies outside their scope).
 * Returns whether access grew, in which case older records need a full pull to arrive.
 */
export function applyAccess(store: LocalStore, access: FamilySummary[]): boolean {
  const previous = getAccess(store)
  if (JSON.stringify(previous) !== JSON.stringify(access)) setAccess(store, access)

  const visible = (familyId: string | null, babyId: string) => {
    // Records created while signed out are not in any family yet and always stay.
    if (familyId === null) return true
    const family = access.find((item) => item.id === familyId)
    return family !== undefined && canSeeBaby(family, babyId)
  }
  for (const baby of store.babies.toArray) {
    if (!visible(baby.familyId, baby.id)) removeLocal(store, 'babies', baby.id)
  }
  for (const event of store.events.toArray) {
    if (!visible(event.familyId, event.babyId)) removeLocal(store, 'events', event.id)
  }

  // New babies go to the account's family; move on if the user is no longer in it.
  const account = getAccount(store)
  if (account && !access.some((family) => family.id === account.familyId)) {
    const next = access.find((family) => family.role === 'owner') ?? access[0]
    if (next) setAccount(store, { ...account, familyId: next.id })
  }

  return previous !== undefined && accessGrew(previous, access)
}

/** What the signed-in user may do with a record; everything is allowed for local-only data. */
export interface Permissions {
  role: FamilyRole | null
  /** Add events for the baby. */
  canLog: boolean
  /** Edit or delete the baby's profile. */
  canManageBaby: boolean
  /** Invite and manage members of the baby's family. */
  canManageMembers: boolean
}

const FULL: Permissions = {
  role: null,
  canLog: true,
  canManageBaby: true,
  canManageMembers: false,
}

function familyOf(
  access: FamilySummary[] | undefined,
  familyId: string | null,
): FamilySummary | undefined {
  return familyId === null ? undefined : access?.find((family) => family.id === familyId)
}

export function babyPermissions(
  access: FamilySummary[] | undefined,
  baby: Pick<Baby, 'familyId'> | undefined,
): Permissions {
  // Unknown families (signed out, or not pulled yet) are the user's own.
  const family = baby ? familyOf(access, baby.familyId) : undefined
  if (!family) return FULL
  const manages = isManager(family.role)
  return {
    role: family.role,
    canLog: family.role !== 'viewer',
    canManageBaby: manages,
    canManageMembers: manages,
  }
}

/** Caregivers change only events they recorded; viewers change nothing. */
export function canEditEvent(
  access: FamilySummary[] | undefined,
  event: Pick<Event, 'familyId' | 'createdBy'>,
  userId: string | undefined,
): boolean {
  const family = familyOf(access, event.familyId)
  if (!family) return true
  if (family.role === 'viewer') return false
  if (family.role === 'caregiver') return event.createdBy === null || event.createdBy === userId
  return true
}

/**
 * Families a new baby can go to: those the user manages, plus `null` (a new family of their
 * own, created on the next sync) when they don't own one yet. Signed out, babies stay local.
 */
export function babyFamilyChoices(store: LocalStore): {
  choices: (string | null)[]
  preferred: string | null
} {
  const account = getAccount(store)
  if (!account) return { choices: [null], preferred: null }
  const access = getAccess(store)
  // Before the first pull, only the account's own default is known.
  if (!access) return { choices: [account.familyId], preferred: account.familyId }
  const choices: (string | null)[] = access.filter(canAddBabies).map((family) => family.id)
  if (!access.some((family) => family.role === 'owner')) choices.push(null)
  const preferred = choices.includes(account.familyId) ? account.familyId : (choices[0] ?? null)
  return { choices, preferred }
}
