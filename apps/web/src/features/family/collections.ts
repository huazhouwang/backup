import type { FamilyMember, Invite } from '@lullabo/shared'
import { createCollection } from '@tanstack/db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import { useLiveQuery } from '@tanstack/react-db'
import { type QueryClient, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { collectionCache } from '../../lib/server-collection'
import { useAccess } from '../../sync/use-access'
import { familyApi } from './api'
import { familyKeys } from './queries'

/**
 * A family's members, from the server. Changing a member's role or babies, or removing
 * them, shows at once and is rolled back if the server refuses (TanStack DB's optimistic
 * mutations); the list refetches after each change.
 */
function createMembers(queryClient: QueryClient, familyId: string) {
  return createCollection(
    queryCollectionOptions({
      queryKey: familyKeys.members(familyId),
      queryFn: (): Promise<FamilyMember[]> => familyApi.members(familyId),
      queryClient,
      getKey: (member: FamilyMember) => member.userId,
      // Member names rarely change; changes refetch anyway.
      staleTime: Infinity,
      onUpdate: async ({ transaction }) => {
        await Promise.all(
          transaction.mutations.map(({ key, changes }) =>
            familyApi.updateMember(familyId, key, {
              ...(changes.role && changes.role !== 'owner' ? { role: changes.role } : {}),
              ...('babyIds' in changes ? { babyIds: changes.babyIds ?? null } : {}),
            }),
          ),
        )
      },
      onDelete: async ({ transaction }) => {
        await Promise.all(
          transaction.mutations.map(({ key }) => familyApi.removeMember(familyId, key)),
        )
      },
    }),
  )
}

const cachedMembers = collectionCache<ReturnType<typeof createMembers>>()

export function membersCollection(queryClient: QueryClient, userId: string, familyId: string) {
  return cachedMembers(queryClient, `${userId}:${familyId}`, () =>
    createMembers(queryClient, familyId),
  )
}

/** A family's open invites; revoking one removes it at once (rolled back on failure). */
function createInvites(queryClient: QueryClient, familyId: string) {
  return createCollection(
    queryCollectionOptions({
      queryKey: familyKeys.invites(familyId),
      queryFn: (): Promise<Invite[]> => familyApi.invites(familyId),
      queryClient,
      getKey: (invite: Invite) => invite.code,
      onDelete: async ({ transaction }) => {
        await Promise.all(
          transaction.mutations.map(({ key }) => familyApi.revokeInvite(familyId, key)),
        )
      },
    }),
  )
}

const cachedInvites = collectionCache<ReturnType<typeof createInvites>>()

export function invitesCollection(queryClient: QueryClient, userId: string, familyId: string) {
  return cachedInvites(queryClient, `${userId}:${familyId}`, () =>
    createInvites(queryClient, familyId),
  )
}

/** The members collection of a family for the signed-in user, or null without one. */
export function useMembersCollection(familyId: string | null | undefined) {
  const queryClient = useQueryClient()
  const { userId } = useAccess()
  return userId && familyId ? membersCollection(queryClient, userId, familyId) : null
}

/** The invites collection of a family for the signed-in user, or null. */
export function useInvitesCollection(familyId: string, enabled: boolean) {
  const queryClient = useQueryClient()
  const { userId } = useAccess()
  return userId && enabled ? invitesCollection(queryClient, userId, familyId) : null
}

/** Members of a family, or undefined while loading, offline or signed out. */
export function useMembers(familyId: string | null | undefined) {
  const collection = useMembersCollection(familyId)
  const { data, isReady } = useLiveQuery(
    (q) => (collection ? q.from({ member: collection }) : undefined),
    [collection],
  )
  return collection && isReady ? data : undefined
}

// Members already looked up again after a cache miss, so a member who left isn't refetched
// by every record that mentions them.
const refetchedFor = new Set<string>()

/** Display name of a family member; refetches once if they joined after the list was cached. */
export function useMemberName(familyId: string | null, userId: string | null) {
  const collection = useMembersCollection(familyId)
  const members = useMembers(familyId)
  const member = members?.find((item) => item.userId === userId)
  const missing = familyId !== null && userId !== null && members !== undefined && !member
  useEffect(() => {
    const key = `${familyId}:${userId}`
    if (!missing || !collection || refetchedFor.has(key)) return
    refetchedFor.add(key)
    void collection.utils.refetch()
  }, [missing, familyId, userId, collection])
  return member?.name
}

/** Open invites of a family the user manages; empty otherwise. */
export function useInvites(familyId: string, managing: boolean) {
  const collection = useInvitesCollection(familyId, managing)
  const { data } = useLiveQuery(
    (q) => (collection ? q.from({ invite: collection }) : undefined),
    [collection],
  )
  return { invites: data ?? [], collection }
}
