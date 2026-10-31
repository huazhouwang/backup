// What the voice and tips APIs send: shared, so the app and the server agree on it.

export interface VoiceSettings {
  /** What the user says to Siri, i.e. the name they gave the shortcut. */
  phrase: string
  /** The code the shortcut uses, if one is active; the code itself is never shown again. */
  token: { createdAt: number; lastUsedAt: number | null } | null
  /**
   * Whose AI commands use: the user's own (every family), one a family shared (only that
   * family), or none yet.
   */
  ai: { kind: 'own' } | { kind: 'shared'; familyName: string; by: string } | null
}

/** The agent's answer to one message. */
export interface ChatTurn {
  reply: string
  /** The user said they're finished. */
  done: boolean
  /** A change is waiting for the user's yes or no. */
  confirming: boolean
}

export interface ChatLine {
  /** `${threadId}~${index}` for a stored message; random for one shown before the answer. */
  id: string
  /** The conversation it belongs to; null until the server answers. */
  threadId: string | null
  role: 'user' | 'assistant'
  text: string
  /** What the speech model heard, for a spoken message the correction changed. */
  heard?: string
}

/** A text's words alone: no punctuation, spacing or case. */
const wordsOf = (text: string) => text.replaceAll(/[\s\p{P}\p{S}]/gu, '').toLowerCase()

/** Whether a correction changed the words, not just punctuation, spacing or case. */
export const correctionChanged = (heard: string, corrected: string) =>
  wordsOf(heard) !== wordsOf(corrected)

/** A page of the last 30 days of conversations, oldest message first. */
export interface ChatPage {
  lines: ChatLine[]
  /** When each conversation on the page started. */
  threads: Record<string, { startedAt: number }>
  /** Where the page before this one ends; null at the oldest kept. */
  next: string | null
  /** The conversation the next message continues; null after a pause. */
  activeThreadId: string | null
}

/** The AI's observation on a baby's week, or why there is none today. */
export type Observation =
  | { day: string; text: string }
  | { day: string; text: null; reason: 'sparse' | 'noAi' | 'limited' | 'failed' }
