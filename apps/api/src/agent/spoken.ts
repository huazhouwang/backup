import { correctionChanged } from '@lullabo/shared'

/** Ends a corrected message that holds what the speech model heard. */
const HEARD = /\n（语音原文：([^]*)）$/

/**
 * A spoken message as the assistant reads it and the conversation keeps it: the corrected
 * text, and what was heard when the correction changed the words, so a correction that went
 * wrong can be seen (by the assistant, and in the chat).
 */
export const withHeard = (corrected: string, heard: string) =>
  correctionChanged(heard, corrected) ? `${corrected}\n（语音原文：${heard}）` : corrected

/** A kept message's text and, for a corrected spoken one, what was heard. */
export function splitHeard(content: string): { text: string; heard?: string } {
  const match = HEARD.exec(content)
  return match ? { text: content.slice(0, match.index), heard: match[1] } : { text: content }
}
