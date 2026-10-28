import type { AiProvider, FamilyAi, ProviderModels, UserAi } from '@lullabo/shared'

import { apiFetch } from '../../lib/api'

export const PROVIDER_LABEL: Record<AiProvider, string> = {
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
}

export const aiApi = {
  get: () => apiFetch<UserAi>('/api/ai'),
  models: () => apiFetch<{ providers: ProviderModels[] }>('/api/ai/models'),
  /** Checks and saves a key; the first key also picks the model. */
  saveKey: (provider: AiProvider, apiKey: string) =>
    apiFetch<UserAi>(`/api/ai/keys/${provider}`, {
      method: 'PUT',
      body: JSON.stringify({ apiKey }),
    }),
  removeKey: (provider: AiProvider) =>
    apiFetch<UserAi>(`/api/ai/keys/${provider}`, { method: 'DELETE' }),
  choose: (choice: { provider: AiProvider; model: string }) =>
    apiFetch<UserAi>('/api/ai', { method: 'PUT', body: JSON.stringify(choice) }),
  share: (familyIds: string[]) =>
    apiFetch<UserAi>('/api/ai/shares', { method: 'PUT', body: JSON.stringify({ familyIds }) }),
  family: (familyId: string) =>
    apiFetch<FamilyAi>(`/api/families/${encodeURIComponent(familyId)}/ai`),
  /** Owners and admins: use this member's shared AI. */
  chooseForFamily: (familyId: string, userId: string) =>
    apiFetch<FamilyAi>(`/api/families/${encodeURIComponent(familyId)}/ai`, {
      method: 'PUT',
      body: JSON.stringify({ userId }),
    }),
}

export { AI_PROVIDERS } from '@lullabo/shared'
export type {
  AiModel,
  AiProvider,
  FamilyAi,
  ModelTag,
  ProviderModels,
  UserAi,
} from '@lullabo/shared'
