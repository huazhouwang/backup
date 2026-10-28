// What the AI settings API sends: shared, so the app and the server agree on it.

/** Model providers voice logging can use. */
export const AI_PROVIDERS = ['openai', 'openrouter'] as const
export type AiProvider = (typeof AI_PROVIDERS)[number]

/** Why a recommended model is recommended: shown next to it. */
export type ModelTag = 'steady' | 'cheapest' | 'balanced'

/** USD per million tokens. */
export interface ModelPrice {
  input: number
  output: number
}

export interface AiModel {
  id: string
  /** Set on the recommended ones, which come first. */
  tag?: ModelTag
  /** Only where the provider lists prices (OpenRouter). */
  price?: ModelPrice
  /**
   * Fits everyday logging. The others are listed only on request: aliases whose model can
   * change (~…, …-latest), pinned snapshots, batch variants that cannot answer at once,
   * reasoning models that keep Siri waiting, and expensive ones.
   */
  everyday: boolean
}

/** What each saved key can use; a key that stopped working says so. */
export type ProviderModels =
  | { provider: AiProvider; status: 'ok'; models: AiModel[] }
  | { provider: AiProvider; status: 'invalid' | 'unreachable' }

/** The user's own AI settings; keys never come back, only their last characters. */
export interface UserAi {
  /** One per provider. */
  keys: { provider: AiProvider; keyHint: string }[]
  /** The model voice commands use. */
  choice: { provider: AiProvider; model: string } | null
  /** Families the user shares it with. */
  sharedFamilyIds: string[]
}

/** The AIs members shared with a family, and the one it uses. */
export interface FamilyAi {
  /** The member whose AI the family uses; null when nobody shares one. */
  inUse: string | null
  shares: { userId: string; name: string; provider: AiProvider; model: string }[]
}
