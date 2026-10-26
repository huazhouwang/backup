import { queryOptions } from '@tanstack/react-query'

import { apiFetch } from '../../lib/api'

/** The AI's observation on a baby's week, or why there is none today. */
export type Observation =
  | { day: string; text: string }
  | { day: string; text: null; reason: 'sparse' | 'noAi' | 'limited' | 'failed' }

export const tipsQueries = {
  /** Written once a day on the server; asked again when the day changes. */
  observation: (babyId: string, day: string) =>
    queryOptions({
      queryKey: ['tips', 'observation', babyId, day],
      queryFn: () =>
        apiFetch<Observation>(
          `/api/tips/observation?${new URLSearchParams({
            babyId,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          })}`,
        ),
      staleTime: Number.POSITIVE_INFINITY,
      retry: false,
    }),
}
