const MODEL = '@cf/openai/whisper-large-v3-turbo'

/** Words Whisper may not expect, so it spells them as the family does (and in simplified script). */
const VOCABULARY: Record<string, string> = {
  zh: '宝宝喝了120毫升奶粉，母乳亲喂左边10分钟，换尿布，便便，睡着了，醒了，体温，辅食。',
}
/** Whisper reads only the last couple of hundred tokens of a prompt; keep it within that. */
const PROMPT_CHARS = 200

/** Standard, padded base64, as Workers AI takes audio; built in chunks to spare the stack. */
function base64(bytes: ArrayBuffer) {
  const view = new Uint8Array(bytes)
  let binary = ''
  for (let i = 0; i < view.length; i += 0x8000) {
    binary += String.fromCharCode(...view.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

/** The two-letter code of a locale's language, as the vocabulary is kept by. */
export function speechLanguage(locale: string | undefined) {
  if (!locale) return undefined
  try {
    const { language } = new Intl.Locale(locale)
    return /^[a-z]{2}$/.test(language) ? language : undefined
  } catch {
    return undefined
  }
}

/** What a recording is likely to contain, to help the model spell it. */
export interface SpeechHints {
  /** The babies' names. */
  names: string[]
  /** Foods and medicines the family logs. */
  words: string[]
  /** The assistant's last line, which this may answer. */
  recent?: string
}

/**
 * The prompt Whisper reads as the text before the recording: the conversation's last line
 * and the words it should know, ending with the vocabulary in the right script.
 */
export function speechPrompt(language: string | undefined, hints: SpeechHints) {
  const vocabulary = language ? (VOCABULARY[language] ?? '') : ''
  const words = [...hints.names, ...hints.words].join(', ')
  const prompt = [hints.recent, words, vocabulary].filter(Boolean).join(' ')
  // The end matters most: the vocabulary sets the script, the names come right before.
  return prompt.slice(-PROMPT_CHARS)
}

type Segment = NonNullable<Ai_Cf_Openai_Whisper_Large_V3_Turbo_Output['segments']>[number]

/**
 * A stretch Whisper most likely made up from background noise, often out of the prompt's
 * words (a lone "奶粉" after the answer, a "嗨!" at the end): it judged it probably not
 * speech and was unsure of the words, or was very unsure of them.
 */
export function likelyNoise({ no_speech_prob: noSpeech = 0, avg_logprob: logprob = 0 }: Segment) {
  return (noSpeech > 0.5 && logprob < -0.7) || logprob < -1.2
}

/** What a recording's segments say, without the ones that were likely noise. */
export function heardText(output: Ai_Cf_Openai_Whisper_Large_V3_Turbo_Output) {
  const { segments } = output
  if (!segments?.length) return output.text.trim()
  const kept = segments.filter((segment) => !likelyNoise(segment))
  // How sure Whisper was, for tuning the above in the Worker's logs: never what was said.
  console.log('Transcription', {
    segments: segments.map((segment) => ({
      noSpeech: Number((segment.no_speech_prob ?? 0).toFixed(2)),
      logprob: Number((segment.avg_logprob ?? 0).toFixed(2)),
      seconds: Number(((segment.end ?? 0) - (segment.start ?? 0)).toFixed(1)),
      dropped: !kept.includes(segment),
    })),
  })
  return kept
    .map((segment) => segment.text ?? '')
    .join('')
    .trim()
}

/**
 * What was said in a recording (WAV, as the chat uploads it), or null when nothing was heard.
 * `locale` is the language the app is in, so the likeliest spoken: its vocabulary goes in the
 * prompt, but Whisper tells the language itself. Forced, a phone set to English turned
 * Chinese speech into English, and a sentence in another language would be translated.
 */
export async function transcribe(
  ai: Ai,
  audio: ArrayBuffer,
  locale: string | undefined,
  hints: SpeechHints,
): Promise<string | null> {
  const language = speechLanguage(locale)
  const prompt = speechPrompt(language, hints)
  const result = await ai.run(MODEL, {
    audio: base64(audio),
    task: 'transcribe',
    ...(prompt ? { initial_prompt: prompt } : {}),
    vad_filter: true,
    // Skips what it would make up over a pause, as it does at a recording's noisy end.
    hallucination_silence_threshold: 1.5,
  })
  const text = heardText(result)
  return text ? text : null
}
