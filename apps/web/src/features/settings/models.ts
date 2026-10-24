/** The user's API keys and models as the settings page loads them */
import type { useQueryClient } from '@tanstack/react-query';

export interface Models {
  keys: { id: string; provider: string; base_url: string | null; key_hint: string; created_at: number }[];
  models: { id: string; key_id: string; label: string; model: string; provider: string }[];
  defaultModelId: string | null;
  providers: Record<string, { name: string; models: string[]; needsBaseUrl?: boolean; hint: string }>;
}

export const refreshModels = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries({ queryKey: ['models'] });
