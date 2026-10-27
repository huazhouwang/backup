import type { FamilySummary } from '@lullabo/shared'
import { createOptimisticAction } from '@tanstack/db'
import { useMemo } from 'react'

import { useLocalStore } from '../../db'
import { patchAccessFamily } from '../../sync/local'
import { requestSync } from '../../sync/runner'

interface FamilyChange {
  familyId: string
  patch: Partial<Pick<FamilySummary, 'name' | 'alias'>>
  /** The server call that makes the change. */
  save: () => Promise<void>
}

/**
 * Renames a family or sets its alias as a TanStack DB optimistic action: the local family
 * list changes at once and rolls back if the server refuses. Once the server agrees, the
 * change is kept locally and the next pull brings the server's copy.
 */
export function useUpdateFamily() {
  const store = useLocalStore()
  return useMemo(
    () =>
      createOptimisticAction<FamilyChange>({
        onMutate: ({ familyId, patch }) => patchAccessFamily(store, familyId, patch),
        mutationFn: async ({ save }, { transaction }) => {
          await save()
          await store.meta.utils.acceptMutations(transaction)
          void requestSync()
        },
      }),
    [store],
  )
}
