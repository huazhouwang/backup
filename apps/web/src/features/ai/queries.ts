import { queryOptions } from '@tanstack/react-query'

import { PERSIST } from '../../lib/query'
import { aiApi } from './api'

// Account-side caches don't carry the user id: signing out clears the whole query cache
// (features/account/AccountSettings.tsx). `all` keys are roots for invalidating a whole group.

export const aiKeys = {
  all: ['ai'] as const,
  mine: ['ai', 'mine'] as const,
  models: ['ai', 'models'] as const,
  families: ['ai', 'family'] as const,
  family: (familyId: string) => ['ai', 'family', familyId] as const,
}

export const aiQueries = {
  /** The user's keys, model and shares. */
  mine: () => queryOptions({ queryKey: aiKeys.mine, queryFn: aiApi.get, meta: PERSIST }),
  /** Every saved key's models; slow to list, so kept for an hour. */
  models: () =>
    queryOptions({ queryKey: aiKeys.models, queryFn: aiApi.models, staleTime: 60 * 60 * 1000 }),
  /** The AIs shared with a family, and the one it uses. */
  family: (familyId: string) =>
    queryOptions({
      queryKey: aiKeys.family(familyId),
      queryFn: () => aiApi.family(familyId),
      meta: PERSIST,
    }),
}
