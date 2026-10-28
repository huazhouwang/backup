import { showToast } from '@lullabo/ui/toast'
import {
  type MutationOptions,
  type QueryClient,
  type QueryKey,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'

import { m } from '../paraglide/messages.js'

interface OptimisticOptions<TData, TVariables> {
  /** The cached server data the change applies to. */
  queryKey: QueryKey
  mutationFn: (variables: TVariables) => Promise<TData>
  /** The data as it will be once the server agrees. */
  apply: (data: TData, variables: TVariables) => TData
  /** After the server agreed (its copy is already in the cache). */
  onSaved?: (saved: TData) => void
  /** After the server refused, with the data put back as it was. */
  onRefused?: (restored: TData | undefined) => void
}

/**
 * A change shown at once, TanStack Query's optimistic update: the cached data changes before
 * the server answers, goes back with a toast if it refuses, and takes the server's copy when
 * it agrees. Changes to the same data reach the server one at a time, in order.
 */
export function optimisticOptions<TData, TVariables>(
  queryClient: QueryClient,
  { queryKey, mutationFn, apply, onSaved, onRefused }: OptimisticOptions<TData, TVariables>,
): MutationOptions<TData, Error, TVariables, { before: TData | undefined }> {
  return {
    mutationFn,
    scope: { id: JSON.stringify(queryKey) },
    onMutate: async (variables) => {
      // A refetch already on its way would overwrite the change.
      await queryClient.cancelQueries({ queryKey })
      const before = queryClient.getQueryData<TData>(queryKey)
      if (before !== undefined) queryClient.setQueryData<TData>(queryKey, apply(before, variables))
      return { before }
    },
    onError: (_error, _variables, context) => {
      if (context?.before !== undefined) queryClient.setQueryData(queryKey, context.before)
      showToast(m.actionFailed(), { tone: 'error' })
      onRefused?.(context?.before)
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKey, saved)
      onSaved?.(saved)
    },
  }
}

/** `optimisticOptions` as a mutation hook. */
export function useOptimisticMutation<TData, TVariables = void>(
  options: OptimisticOptions<TData, TVariables>,
) {
  return useMutation(optimisticOptions(useQueryClient(), options))
}
