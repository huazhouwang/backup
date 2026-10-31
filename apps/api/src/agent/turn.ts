import { type Access, loadAccess } from '../access'
import { modelOptionsFor } from '../ai/providers'
import type { Env } from '../env'
import { readSettings } from '../voice/settings'
import { type AdapterFor, payingAi, withinDailyLimit } from './budget'
import { spokenWords, writableBabies } from './data'
import { correctHeard } from './heard'
import { runAgent } from './run'
import type { AgentScope, AgentTurn } from './scope'
import { withHeard } from './spoken'

/** Foods and medicines logged within this long help recognise speech. */
const WORDS_SINCE_MS = 30 * 86_400_000

export const REPLIES = {
  invalidToken: '口令已失效，请到 Lullabo 的设置 → Siri 语音记录里重新添加。',
  limited: '今天说得太多次了，明天再试吧。',
  slowDown: '说得太快了，请稍等一下再试。',
  unavailable: '语音记录暂时不可用，请稍后再试。',
  noAi: '还没有可用的 AI。请在 Lullabo 的 设置 → 我的 AI 里填自己的 key，或请家人分享给家庭。',
  noFamily: '还没有可以记录的家庭。',
  unclear: '没听清，请再说一遍。',
}

export const stop = (reply: string): AgentTurn => ({ reply, done: true, confirming: false })

/** The babies' names and the foods and medicines logged for them: words speech may contain. */
export async function speechHints(db: D1Database, access: Access, now: number) {
  const babies = await writableBabies(db, [...access.values()])
  const words = await spokenWords(
    db,
    babies.map((baby) => baby.id),
    now - WORDS_SINCE_MS,
  )
  return { names: babies.map((baby) => baby.name), words }
}

export interface TurnOptions {
  /** The device's zone and the app's language, when they come with the message. */
  timeZone?: string
  locale?: string
  /** Heard from a recording: corrected first, with the chat's last lines as context. */
  spoken?: { recent: string[]; onHeard: (text: string) => void }
  /** The reply so far, as the model writes it. */
  onText?: (text: string) => void
  /** The tip the chat was opened from. */
  tip?: string
}

/** One message to the user's agent, from the chat box or Siri. */
export async function turn(
  env: Env,
  adapterFor: AdapterFor,
  userId: string,
  said: string,
  now: number,
  options: TurnOptions = {},
): Promise<AgentTurn> {
  const db = env.DB
  const [access, settings] = await Promise.all([loadAccess(db, userId), readSettings(db, userId)])
  const families = [...access.values()].filter((family) => family.role !== 'viewer')
  if (families.length === 0) return stop(REPLIES.noFamily)
  const paying = await payingAi(env, adapterFor, userId, access)
  if (!paying) return stop(REPLIES.noAi)
  const { ai, adapter } = paying
  if (!(await withinDailyLimit(db, userId, settings, now))) return stop(REPLIES.limited)
  const scope: AgentScope = {
    db,
    access,
    families: families.filter((family) => ai.familyIds.includes(family.id)),
    sharedOnly: ai.kind === 'shared',
    keyScope: ai.kind === 'own' ? 'own' : `shared:${ai.ai.userId}:${ai.ai.familyId}`,
    userId,
    timeZone: options.timeZone ?? settings.timeZone,
    locale: options.locale ?? settings.locale,
    phrase: settings.phrase,
    modelOptions: modelOptionsFor(ai.ai.provider, ai.ai.model),
    onText: options.onText,
    tip: options.tip,
  }
  let text = said
  if (options.spoken) {
    const hints = await speechHints(db, access, now)
    const correctors = { own: { adapter, modelOptions: scope.modelOptions }, quick: env.AI }
    text = await correctHeard(correctors, said, {
      ...hints,
      conversation: options.spoken.recent,
    })
    options.spoken.onHeard(text)
    text = withHeard(text, said)
  }
  return runAgent(adapter, scope, text, now)
}
