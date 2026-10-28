import type { AiModel, AiProvider, ModelPrice, ModelTag } from '@lullabo/shared'
import { openaiCompatibleText } from '@tanstack/ai-openai/compatible'

export { AI_PROVIDERS } from '@lullabo/shared'
export type { AiModel, AiProvider, ModelPrice, ModelTag } from '@lullabo/shared'

interface ProviderInfo {
  baseURL: string
  api: 'responses' | 'chat-completions'
  /** Shown first, in this order: small, fast, cheap, with strict structured outputs. */
  recommended: [string, ModelTag][]
  /** Which listed models can run the assistant (chat models that call tools). */
  usable: (model: ListedModel) => boolean
  /** A cheap request that fails with a bad key. */
  keyCheck: string
}

interface ListedModel {
  id: string
  supported_parameters?: string[]
  /** OpenRouter only: USD per token, as strings. */
  pricing?: { prompt?: string; completion?: string }
}

const PROVIDERS: Record<AiProvider, ProviderInfo> = {
  openai: {
    baseURL: 'https://api.openai.com/v1',
    api: 'responses',
    recommended: [
      ['gpt-5.4-mini', 'steady'],
      ['gpt-5.4-nano', 'balanced'],
    ],
    usable: ({ id }) =>
      /^(gpt-|o\d)/.test(id) && !/(audio|realtime|image|tts|transcribe|search)/.test(id),
    keyCheck: 'https://api.openai.com/v1/models',
  },
  openrouter: {
    baseURL: 'https://openrouter.ai/api/v1',
    api: 'chat-completions',
    // The first is picked for a new key: DeepSeek passes every agent eval and costs least.
    recommended: [
      ['deepseek/deepseek-v4.1-flash', 'cheapest'],
      ['openai/gpt-5.4-mini', 'steady'],
      ['openai/gpt-5.4-nano', 'balanced'],
    ],
    usable: ({ supported_parameters: params = [] }) => params.includes('tools'),
    keyCheck: 'https://openrouter.ai/api/v1/key',
  },
}

/** Over either of these (USD per million tokens), a model costs more than logging needs. */
const PRICEY = { input: 2, output: 10 }

const perMillion = (value: string | undefined) => {
  const parsed = Number(value)
  return value !== undefined && Number.isFinite(parsed) ? Math.round(parsed * 1e9) / 1e3 : null
}

function priceOf(model: ListedModel): ModelPrice | undefined {
  const input = perMillion(model.pricing?.prompt)
  const output = perMillion(model.pricing?.completion)
  return input !== null && output !== null && input >= 0 && output >= 0
    ? { input, output }
    : undefined
}

function everyday(id: string, price: ModelPrice | undefined) {
  const name = id.slice(id.indexOf('/') + 1)
  if (id.startsWith('~') || /:batch$|-latest$/.test(id)) return false
  if (/-(\d{4}|\d{8}|\d{4}-\d{2}-\d{2})(:|$)/.test(name)) return false
  if (/(^|-)(o\d|r1|pro)(-|:|$)|thinking|reasoner|deep-research/.test(name)) return false
  return !price || (price.input <= PRICEY.input && price.output <= PRICEY.output)
}

export class AiKeyError extends Error {}

/** Checks a key and lists the models it can use for voice commands, recommended first. */
export async function listModels(provider: AiProvider, apiKey: string): Promise<AiModel[]> {
  const info = PROVIDERS[provider]
  const auth = { Authorization: `Bearer ${apiKey}` }
  const check = await fetch(info.keyCheck, { headers: auth })
  if (!check.ok) throw new AiKeyError(`key check failed: ${check.status}`)
  const res =
    provider === 'openai' ? check : await fetch(`${info.baseURL}/models`, { headers: auth })
  if (!res.ok) throw new AiKeyError(`model list failed: ${res.status}`)
  const body: unknown = await res.json()
  const data =
    typeof body === 'object' && body !== null && 'data' in body && Array.isArray(body.data)
      ? body.data
      : []
  const listed = data
    .filter((item): item is ListedModel => typeof item?.id === 'string')
    .filter(info.usable)
  const tags = new Map(info.recommended)
  const models = listed.map((item) => {
    const price = priceOf(item)
    const tag = tags.get(item.id)
    const model: AiModel = { id: item.id, everyday: Boolean(tag) || everyday(item.id, price) }
    if (tag) model.tag = tag
    if (price) model.price = price
    return model
  })
  const rank = (model: AiModel) => info.recommended.findIndex(([id]) => id === model.id)
  const recommended = models.filter((model) => model.tag).toSorted((a, b) => rank(a) - rank(b))
  const rest = models.filter((model) => !model.tag).toSorted((a, b) => a.id.localeCompare(b.id))
  return [...recommended, ...rest]
}

/**
 * Most tokens one model call may write. Replies are a sentence or two, but reasoning models
 * also count their thinking. Without a cap, OpenRouter reserves the model's maximum (64k
 * tokens) against the key's credit and refuses keys with a small balance (402).
 */
export const MAX_OUTPUT_TOKENS = 4096

/**
 * OpenAI's reasoning models (GPT-5, o-series), directly or through OpenRouter. Without a
 * reasoning effort they plan out loud in the reply ("Need update latest diaper…"), which
 * Siri then reads; older GPT models reject the parameter.
 */
const thinksAloud = (model: string) => /^(openai\/)?(gpt-5|o\d)/.test(model)

/**
 * Request options for the provider and model:
 * - the output cap, under the name its API uses
 * - low reasoning effort for OpenAI's reasoning models, so their thinking stays out of the
 *   reply
 * - on OpenRouter, only hosts that support every parameter sent, tools included: a host
 *   without tool calling has models write their calls as text (DeepSeek's DSML), which the
 *   user would then hear
 */
export function modelOptionsFor(provider: AiProvider, model: string): Record<string, unknown> {
  const reasoning = thinksAloud(model) ? { reasoning: { effort: 'low' } } : {}
  return PROVIDERS[provider].api === 'responses'
    ? { max_output_tokens: MAX_OUTPUT_TOKENS, ...reasoning }
    : {
        max_tokens: MAX_OUTPUT_TOKENS,
        ...reasoning,
        ...(provider === 'openrouter' ? { provider: { require_parameters: true } } : {}),
      }
}

/** The model to start with: the first recommended one this key can use. */
export const firstChoice = (models: AiModel[]) =>
  models.find((model) => model.tag) ?? models.find((model) => model.everyday) ?? models[0]

/** The model adapter for saved AI settings. */
export function aiAdapter(provider: AiProvider, model: string, apiKey: string) {
  const info = PROVIDERS[provider]
  // One slow provider call must not use up the whole turn (TURN_TIMEOUT_MS); one retry at most.
  return openaiCompatibleText(model, {
    baseURL: info.baseURL,
    apiKey,
    api: info.api,
    timeout: 15_000,
    maxRetries: 1,
  })
}
