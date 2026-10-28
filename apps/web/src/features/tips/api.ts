import type { Observation } from '@lullabo/shared'

import { apiFetch } from '../../lib/api'

export type { Observation } from '@lullabo/shared'

export const tipsApi = {
  /** The AI's observation on a baby's week, in the user's time zone. */
  observation: (babyId: string) =>
    apiFetch<Observation>(
      `/api/tips/observation?${new URLSearchParams({
        babyId,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })}`,
    ),
}
