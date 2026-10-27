import type { Baby, Event, FamilySummary } from '@lullabo/shared'
import { eq, inArray, useLiveQuery } from '@tanstack/react-db'
import { useMemo } from 'react'

import { useLocalStore } from '../db'
import { type Permissions, babyFamilyChoices, babyPermissions, canEditEvent } from './access'
import { ACCESS_KEY, ACCOUNT_KEY, getAccess, getAccount } from './local'

export interface AccessView {
  /** Families from the last pull; undefined while signed out or before the first pull. */
  access: FamilySummary[] | undefined
  userId: string | undefined
  forBaby: (baby: Pick<Baby, 'familyId'> | undefined) => Permissions
  canEditEvent: (event: Pick<Event, 'familyId' | 'createdBy'>) => boolean
  /** Where a new baby can go; `null` stands for a new family of the user's own. */
  babyFamilies: ReturnType<typeof babyFamilyChoices>
}

/**
 * The signed-in account, re-rendering only when it changes (sign-in, sign-out): a live query
 * on its own meta record, not the whole collection, whose sync cursor changes every pull.
 */
export function useAccount() {
  const store = useLocalStore()
  useLiveQuery(
    (q) =>
      q
        .from({ meta: store.meta })
        .where(({ meta }) => eq(meta.key, ACCOUNT_KEY))
        .findOne(),
    [store],
  )
  return getAccount(store)
}

/** The signed-in user's permissions, updated when a pull changes their access. */
export function useAccess(): AccessView {
  const store = useLocalStore()
  // The account and access records only: the sync cursor beside them changes every pull.
  const { data: identity } = useLiveQuery(
    (q) =>
      q
        .from({ meta: store.meta })
        .where(({ meta }) => inArray(meta.key, [ACCOUNT_KEY, ACCESS_KEY])),
    [store],
  )
  return useMemo(() => {
    const access = getAccess(store)
    const userId = getAccount(store)?.userId
    return {
      access,
      userId,
      forBaby: (baby) => babyPermissions(access, baby),
      canEditEvent: (event) => canEditEvent(access, event, userId),
      babyFamilies: babyFamilyChoices(store),
    }
    // Recomputed whenever the account or access record changes.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [store, identity])
}
