import { playCue } from '../../lib/cues'
import { requestSync } from '../../sync/runner'
import { voiceApi } from './api'

/** The last messages, as the agent reads them for context: "User: …", "Assistant: …". */
export const recentContext = (lines: readonly { role: 'user' | 'assistant'; text: string }[]) =>
  lines.slice(-4).map((line) => `${line.role === 'user' ? 'User' : 'Assistant'}: ${line.text}`)

/** What has been said so far, made out while still talking; null when nothing is. */
export const hearSoFar = (soFar: Blob, lastReply: string | undefined) =>
  voiceApi
    .transcribe(soFar, { partial: true, recent: lastReply })
    .then(({ text }) => text)
    .catch(() => null)

/** An answer has come: heard, for a parent not looking at the screen, and its records pulled. */
export function answered() {
  playCue('reply')
  // The agent writes on the server; pull now so the records show without waiting.
  void requestSync()
}
