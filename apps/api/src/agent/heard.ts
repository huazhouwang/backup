import { type AnyTextAdapter, chat } from '@tanstack/ai'

import type { SpeechHints } from '../voice/transcribe'
import { withoutThinking } from './run'

/**
 * A quick model on Workers AI that knows Chinese well. With thinking off it answers in about a
 * second; the user's own model (often slower, over another provider) is only the fallback.
 */
const MODEL = '@cf/qwen/qwen3-30b-a3b-fp8'
/** Correcting waits this long at most; past it, what was heard stands. */
const CORRECT_TIMEOUT_MS = 5_000

/**
 * After the rules dictation apps clean speech with (OpenTypeless's among them): punctuation,
 * no fillers, the user's words spelled their way. Above all, words misheard as others that
 * sound alike, judged by what makes sense in a parent's note about their baby.
 */
const INSTRUCTIONS = `You clean up speech recognition for a baby-tracking app. The text inside <transcription> is what a parent said, as a speech model heard it.

Rules:
1. Fix misheard words: a word that sounds like the right one but makes no sense here. For Chinese, compare the pinyin. Prefer baby-care words (喂奶, 夜奶, 母乳, 奶粉, 瓶喂, 辅食, 换尿布, 尿, 便便, 拉臭臭, 吐奶, 打嗝, 睡着, 醒了, 小睡, 体温, 发烧, 退烧药, 维生素D) and the names and words listed below.
2. Add punctuation. Remove fillers (嗯, 啊, 那个, 就是说, um, uh), false starts and accidental repeats.
3. Simplified Chinese for Chinese. Amounts as digits with their unit (120 毫升, 38.2 度, 15 分钟).
4. Keep what was meant and its language. Never add facts, answer, explain or translate. When unsure, leave the word as heard.
5. Reply with the cleaned text only, without the tags.

Examples:
<transcription>宝宝刚吃完银奶</transcription> → 宝宝刚吃完夜奶。
<transcription>嗯那个他刚才吐奶了然后然后睡着了</transcription> → 他刚才吐奶了，然后睡着了。
<transcription>退烧药吃了五毫升体温三十八度二</transcription> → 退烧药吃了 5 毫升，体温 38.2 度。
<transcription>换了尿布有便便拉的很稀</transcription> → 换了尿布，有便便，拉得很稀。
<transcription>she had a hundred and twenty mils of formula</transcription> → She had 120 ml of formula.`

type Outcome = 'changed' | 'unchanged' | 'empty' | 'answered' | 'timed out' | 'failed'

/** The text of a Workers AI chat answer, in either of the shapes models give it. */
function answerText(result: unknown): string {
  if (typeof result !== 'object' || result === null) return ''
  if ('response' in result && typeof result.response === 'string') return result.response
  const choices: unknown = 'choices' in result ? result.choices : null
  const first: unknown = Array.isArray(choices) ? choices[0] : null
  if (typeof first !== 'object' || first === null || !('message' in first)) return ''
  const { message } = first
  if (typeof message !== 'object' || message === null || !('content' in message)) return ''
  return typeof message.content === 'string' ? message.content : ''
}

/** Where the correction runs: Workers AI where the Worker has it, else the user's model. */
export type Corrector =
  | { ai: Ai }
  | { adapter: AnyTextAdapter; modelOptions: Record<string, unknown> | undefined }

async function ask(
  corrector: Corrector,
  system: string,
  heard: string,
  abortController: AbortController,
) {
  const said = `<transcription>${heard}</transcription>`
  if ('ai' in corrector) {
    const timedOut = new Promise<never>((_, reject) => {
      abortController.signal.addEventListener('abort', () => reject(new Error('Timed out')), {
        once: true,
      })
    })
    const result = await Promise.race([
      corrector.ai.run(MODEL, {
        messages: [
          { role: 'system', content: system },
          // Qwen3's switch for answering straight away, without thinking first.
          { role: 'user', content: `${said} /no_think` },
        ],
        max_tokens: 400,
        temperature: 0.2,
      }),
      timedOut,
    ])
    return answerText(result)
  }
  const { text } = await chat({
    adapter: corrector.adapter,
    abortController,
    modelOptions: corrector.modelOptions,
    stream: false,
    systemPrompts: [system],
    messages: [{ role: 'user', content: said }],
  })
  return text
}

/**
 * What the user said, cleaned: the speech model's mistakes put right with the babies and the
 * conversation in mind, punctuated, without fillers. Any doubt (an error, a timeout, an
 * answer instead of a correction) keeps what was heard.
 */
export async function correctHeard(
  corrector: Corrector,
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
  let outcome: Outcome = 'failed'
  try {
    const answer = await ask(
      corrector,
      [INSTRUCTIONS, ...context].join('\n\n'),
      heard,
      abortController,
    )
    const corrected = withoutThinking(answer)
      .replaceAll(/<\/?transcription>/g, '')
      .trim()
    if (!corrected) {
      outcome = abortController.signal.aborted ? 'timed out' : 'empty'
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
    console.log('Speech correction', {
      outcome,
      ms: Date.now() - started,
      chars: heard.length,
      by: 'ai' in corrector ? 'workers-ai' : 'own',
    })
  }
}
