import type { useTalk } from '../use-talk'

export type Phase = 'idle' | 'talking' | 'hearing' | 'replying' | 'done'

/** One message said and the AI's answer to it. */
export interface Turn {
  id: number
  said: string
  reply: string
  problem: string | null
  /** A change waits for a yes or no. */
  confirming: boolean
}

export type Talk = ReturnType<typeof useTalk>
