import { type AnyTextAdapter, chat } from '@tanstack/ai'

import type { SpeechHints } from '../voice/transcribe'
import { withoutThinking } from './run'

/** Correcting waits this long at most; past it, what was heard stands. */
const CORRECT_TIMEOUT_MS = 8_000

const INSTRUCTIONS = [
  'You correct speech recognition. The text is what a parent said to a baby-tracking app, as a speech model heard it.',
  'Fix only what the speech model got wrong: words that sound alike, misheard names, numbers and units, the wrong script (simplified Chinese for Chinese).',
  'Use the baby names, logged words and recent conversation below to decide. Keep the meaning, wording, language and length; do not answer, explain, translate or add anything.',
  'If nothing is wrong, give the text back unchanged. Reply with the corrected text only.',
].join('\n')

/**
 * What the user said, with the speech model's mistakes put right by their own AI, which
 * knows the babies and the conversation. Any doubt (an error, a timeout, an answer instead
 * of a correction) keeps what was heard.
 */
export async function correctHeard(
  adapter: AnyTextAdapter,
  modelOptions: Record<string, unknown> | undefined,
  heard: string,
  hints: SpeechHints & { conversation: string[] },
): Promise<string> {
  const context = [
    hints.names.length > 0 ? `Baby names: ${hints.names.join(', ')}` : '',
    hints.words.length > 0 ? `Logged lately: ${hints.words.join(', ')}` : '',
    hints.conversation.length > 0 ? `Recent conversation:\n${hints.conversation.join('\n')}` : '',
  ].filter(Boolean)
  const abortController = new AbortController()
  const timer = setTimeout(() => abortController.abort(), CORRECT_TIMEOUT_MS)
  const started = Date.now()
  // How it went, for the Worker's logs: never what was said.
  let outcome: 'changed' | 'unchanged' | 'empty' | 'answered' | 'timed out' | 'failed' = 'failed'
  try {
    const { text } = await chat({
      adapter,
      abortController,
      modelOptions,
      stream: false,
      systemPrompts: [[INSTRUCTIONS, ...context].join('\n\n')],
      messages: [{ role: 'user', content: heard }],
    })
    const corrected = withoutThinking(text).trim()
    if (!corrected) {
      outcome = 'empty'
      return heard
    }
    // A correction is about as long as what it corrects; much longer is an answer.
    if (corrected.length > heard.length * 1.5 + 10) {
      outcome = 'answered'
      return heard
    }
    outcome = corrected === heard ? 'unchanged' : 'changed'
    return corrected
  } catch (error) {
    if (abortController.signal.aborted) outcome = 'timed out'
    else console.error('Correcting speech failed', error)
    return heard
  } finally {
    clearTimeout(timer)
    console.log('Speech correction', { outcome, ms: Date.now() - started, chars: heard.length })
  }
}
