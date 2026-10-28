import type { Access, FamilyAccess } from '../access'

export interface AgentTurn {
  /** What to say back. */
  reply: string
  /** The user said they're finished, or nothing more can be done. */
  done: boolean
  /** A change is waiting for the user's yes or no. */
  confirming: boolean
}

export interface AgentScope {
  db: D1Database
  access: Access
  /** The families the key in use may record for. */
  families: FamilyAccess[]
  /** Recording only for the family that shared its AI: the user has no key of their own. */
  sharedOnly: boolean
  /**
   * Whose key and which families the conversation runs with. A change starts a new
   * conversation, so what was said with one key never goes to another key's provider.
   */
  keyScope: string
  userId: string
  timeZone: string
  /** The app language replies are in (BCP 47); see replyLanguage. */
  locale: string
  phrase: string
  /** Extra request fields for the provider (modelOptionsFor). */
  modelOptions?: Record<string, unknown>
  /** Overrides TURN_TIMEOUT_MS; tests use a short one. */
  timeoutMs?: number
  /** Called with the reply so far as the model writes it, for the chat to show it growing. */
  onText?: (text: string) => void
  /** The tip the parent came from to ask about it, if any (an id from the tips). */
  tip?: string
}
