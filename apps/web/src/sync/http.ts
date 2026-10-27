import {
  type PullResponse,
  type PushRequest,
  type PushResponse,
  RECORDS_VERSION,
  RECORDS_VERSION_HEADER,
} from '@lullabo/shared'

import { apiFetch } from '../lib/api'
import type { SyncApi } from './engine'

export const httpSyncApi: SyncApi = {
  push: (request: PushRequest) =>
    apiFetch<PushResponse>('/api/sync/push', {
      method: 'POST',
      headers: { [RECORDS_VERSION_HEADER]: RECORDS_VERSION },
      body: JSON.stringify(request),
    }),
  pull: (cursor: string) =>
    apiFetch<PullResponse>(`/api/sync/pull?cursor=${encodeURIComponent(cursor)}`),
}
