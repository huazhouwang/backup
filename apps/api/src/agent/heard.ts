import { type AnyTextAdapter, chat } from '@tanstack/ai'

import type { SpeechHints } from '../voice/transcribe'
import { withoutThinking } from './text'

/**
 * A quick model on Workers AI that knows Chinese: with thinking off it answers in well under
 * a second, but it mostly only punctuates. The user's own model understands what was meant
 * ("大三年半" is "大概三点半"), so its answer is used whenever it comes in time.
 */
const QUICK_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8'
/** The user's own model is waited for this long; past it, the quick model's answer is used. */
const OWN_WAIT_MS = 3_000
/** And the quick one this long; past both, what was heard stands. */
const QUICK_WAIT_MS = 5_000

/**
 * The cleanup dictation apps do (OpenTypeless's among them: punctuation, no fillers, the
 * user's words spelled their way), and above all putting right whole words the speech model
 * misheard, by how they sound and what makes sense in a parent's note about their baby.
 */
const INSTRUCTIONS = `You clean up speech recognition for a baby-tracking app. The text inside <transcription> is what a parent said, as a speech model heard it.

Rules:
1. Speech models often mishear whole words and phrases as others that sound alike. Where the text reads oddly or makes no sense for a parent logging their baby, rewrite it into what they most likely said, judged by sound (for Chinese, the pinyin) and by meaning: times, amounts, feeds, sleep, diapers, health. Prefer baby-care words (喂奶, 夜奶, 母乳, 奶粉, 瓶喂, 辅食, 换尿布, 尿, 便便, 拉臭臭, 吐奶, 打嗝, 睡着, 醒了, 小睡, 体温, 发烧, 退烧药, 维生素D) and the names, words and conversation below.
2. Add punctuation. Remove fillers (嗯, 啊, 那个, 就是说, um, uh), false starts and accidental repeats.
3. Simplified Chinese for Chinese. Amounts as digits with their unit (120 毫升, 38.2 度, 15 分钟).
4. Keep what was meant and its language. Words that make sense as heard stay. Never add facts, answer, explain or translate.
5. Reply with the cleaned text only, without the tags.

Examples:
<transcription>大三年半开始睡觉</transcription> → 大概三点半开始睡觉。
<transcription>刚刚吃完银奶毕竟给他换过尿布都是尿</transcription> → 刚刚吃完夜奶，期间给他换过尿布，都是尿。
<transcription>宝宝刚吃完银奶</transcription> → 宝宝刚吃完夜奶。
<transcription>嗯那个他刚才吐奶了然后然后睡着了</transcription> → 他刚才吐奶了，然后睡着了。
<transcription>退烧药吃了五毫升体温三十八度二</transcription> → 退烧药吃了 5 毫升，体温 38.2 度。
<transcription>换了尿布有便便拉的很稀</transcription> → 换了尿布，有便便，拉得很稀。
<transcription>she had a hundred and twenty mils of formula</transcription> → She had 120 ml of formula.`

type Outcome = 'changed' | 'unchanged' | 'empty' | 'answered' | 'timed out' | 'failed' | 'none'

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

/** The models that can correct: the user's own, and the quick one where the Worker has it. */
export interface Correctors {
  own: { adapter: AnyTextAdapter; modelOptions: Record<string, unknown> | undefined }
  quick?: Ai
}

/** Rejects once `ms` have passed, so a slow model is given up on. */
function deadline(ms: number, abortController: AbortController) {
  return new Promise<never>((_, reject) => {
    setTimeout(() => {
      abortController.abort()
      reject(new Error('Timed out'))
    }, ms)
  })
}

async function askOwn(own: Correctors['own'], system: string, said: string) {
  const abortController = new AbortController()
  const { text } = await Promise.race([
    chat({
      adapter: own.adapter,
      abortController,
      modelOptions: own.modelOptions,
      stream: false,
      systemPrompts: [system],
      messages: [{ role: 'user', content: said }],
    }),
    deadline(OWN_WAIT_MS, abortController),
  ])
  return text
}

async function askQuick(ai: Ai, system: string, said: string) {
  const result = await Promise.race([
    ai.run(QUICK_MODEL, {
      messages: [
        { role: 'system', content: system },
        // Qwen3's switch for answering straight away, without thinking first.
        { role: 'user', content: `${said} /no_think` },
      ],
      max_tokens: 400,
      temperature: 0.2,
    }),
    deadline(QUICK_WAIT_MS, new AbortController()),
  ])
  return answerText(result)
}

/** A model's answer as a correction of `heard`, or why it isn't one. */
async function attempt(
  heard: string,
  ask: () => Promise<string>,
): Promise<{ corrected: string | null; outcome: Outcome }> {
  try {
    const corrected = withoutThinking(await ask())
      .replaceAll(/<\/?transcription>/g, '')
      .trim()
    if (!corrected) return { corrected: null, outcome: 'empty' }
    // A correction is about as long as what it corrects; much longer is an answer.
    if (corrected.length > heard.length * 1.5 + 10) return { corrected: null, outcome: 'answered' }
    return { corrected, outcome: corrected === heard ? 'unchanged' : 'changed' }
  } catch (error) {
    if (error instanceof Error && error.message === 'Timed out') {
      return { corrected: null, outcome: 'timed out' }
    }
    console.error('Correcting speech failed', error)
    return { corrected: null, outcome: 'failed' }
  }
}

/**
 * What the user said, cleaned: the speech model's mistakes put right with the babies and the
 * conversation in mind, punctuated, without fillers. Both models start at once; the user's
 * own is used when it answers in time, else the quick one. Any doubt (errors, timeouts, an
 * answer instead of a correction) keeps what was heard.
 */
export async function correctHeard(
  correctors: Correctors,
  heard: string,
  hints: SpeechHints & { conversation: string[] },
): Promise<string> {
  const context = [
    hints.names.length > 0 ? `Baby names: ${hints.names.join(', ')}` : '',
    hints.words.length > 0 ? `Logged lately: ${hints.words.join(', ')}` : '',
    hints.conversation.length > 0 ? `Recent conversation:\n${hints.conversation.join('\n')}` : '',
  ].filter(Boolean)
  const system = [INSTRUCTIONS, ...context].join('\n\n')
  const said = `<transcription>${heard}</transcription>`
  const started = Date.now()
  const { quick: ai } = correctors
  const quick = ai
    ? attempt(heard, () => askQuick(ai, system, said))
    : Promise.resolve({ corrected: null, outcome: 'none' as const })
  const own = await attempt(heard, () => askOwn(correctors.own, system, said))
  const fallback = own.corrected === null ? await quick : null
  // How it went, for the Worker's logs: never what was said.
  console.log('Speech correction', {
    own: own.outcome,
    quick: fallback?.outcome ?? 'unused',
    used: own.corrected !== null ? 'own' : fallback?.corrected ? 'quick' : 'heard',
    ms: Date.now() - started,
    chars: heard.length,
  })
  return own.corrected ?? fallback?.corrected ?? heard
}
