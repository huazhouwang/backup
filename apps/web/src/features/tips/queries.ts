import { queryOptions } from '@tanstack/react-query'

import { tipsApi } from './api'

export const tipsKeys = {
  all: ['tips'] as const,
  observation: (babyId: string, day: string) => ['tips', 'observation', babyId, day] as const,
}

export const tipsQueries = {
  /** Written once a day on the server; asked again when the day changes. */
  observation: (babyId: string, day: string) =>
    queryOptions({
      queryKey: tipsKeys.observation(babyId, day),
      queryFn: () => tipsApi.observation(babyId),
      staleTime: Number.POSITIVE_INFINITY,
      retry: false,
    }),
}
