const MODEL = '@cf/openai/whisper-large-v3-turbo'

/** Words Whisper may not expect, so it spells them as the family does (and in simplified script). */
const VOCABULARY: Record<string, string> = {
  zh: '宝宝喝了120毫升奶粉，母乳亲喂左边10分钟，换尿布，便便，睡着了，醒了，体温，辅食。',
}

/** Standard, padded base64, as Workers AI takes audio; built in chunks to spare the stack. */
function base64(bytes: ArrayBuffer) {
  const view = new Uint8Array(bytes)
  let binary = ''
  for (let i = 0; i < view.length; i += 0x8000) {
    binary += String.fromCharCode(...view.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

/** Whisper takes a language as a two-letter code; anything else is left for it to detect. */
export function speechLanguage(locale: string | undefined) {
  if (!locale) return undefined
  try {
    const { language } = new Intl.Locale(locale)
    return /^[a-z]{2}$/.test(language) ? language : undefined
  } catch {
    return undefined
  }
}

/**
 * What was said in a recording (WAV, as the chat box uploads it), in the user's language,
 * or null when nothing was heard. The babies' names help it spell them.
 */
export async function transcribe(
  ai: Ai,
  audio: ArrayBuffer,
  locale: string | undefined,
  names: string[],
): Promise<string | null> {
  const language = speechLanguage(locale)
  const prompt = [names.join(', '), language ? VOCABULARY[language] : undefined]
    .filter(Boolean)
    .join(' ')
  const result = await ai.run(MODEL, {
    audio: base64(audio),
    task: 'transcribe',
    ...(language ? { language } : {}),
    ...(prompt ? { initial_prompt: prompt } : {}),
    vad_filter: true,
  })
  const text = result.text?.trim()
  return text ? text : null
}
