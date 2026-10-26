import { newId, tipById } from '@bobo/shared'
import {
  type AgentLoopState,
  type AnyTextAdapter,
  EventType,
  type RunAgentResumeItem,
  chat,
  maxIterations,
} from '@tanstack/ai'
import {
  clearToolResults,
  composeStrategies,
  evictOldest,
  withCompaction,
} from '@tanstack/ai-compaction'
import { withPersistence } from '@tanstack/ai-persistence'
import { z } from 'zod'

import type { Access, FamilyAccess } from '../access'
import { describe, formatClock, localNow } from '../voice/plan'
import { eventsByIds, writableBabies } from './data'
import { describeBabies } from './guide'
import { chatPersistence } from './persistence'
import { tipIndex, tipText } from './tips'
import { type AgentContext, agentTools } from './tools'

/** A conversation continues while the user comes back within this long. */
export const SESSION_IDLE_MS = 30 * 60_000
/** Model calls per message: enough to look something up, act on it and answer. */
const MAX_STEPS = 6
/** A whole turn, every model call in it, gets this long: Siri does not wait much longer. */
export const TURN_TIMEOUT_MS = 25_000

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const answerSchema = z.object({ answer: z.enum(['yes', 'no', 'other']) })

/**
 * How the user answered "要修改…吗？", in whatever words or language: yes, no, or null when
 * they said something else ("不是五点，是六点"), which is then a new message.
 */
async function answerTo(
  adapter: AnyTextAdapter,
  scope: AgentScope,
  question: string,
  text: string,
  abortController: AbortController,
): Promise<'yes' | 'no' | null> {
  try {
    const { answer } = await chat({
      adapter,
      abortController,
      modelOptions: scope.modelOptions,
      systemPrompts: [
        'The user was asked to confirm a change to a baby record. Decide whether their reply approves it (yes), refuses it (no), or says something else, such as a correction or a new request (other). The reply may be in any language.',
      ],
      messages: [{ role: 'user', content: `Question: ${question}\nReply: ${text}` }],
      outputSchema: answerSchema,
    })
    return answer === 'other' ? null : answer
  } catch (error) {
    // Unsure: the change is not made, and the reply is handled as a new message.
    console.error('Reading the answer failed', error)
    return null
  }
}

/** A model that writes its tool calls as text (DeepSeek's DSML) instead of calling them. */
const RAW_TOOL_CALL = /｜DSML｜|<\|tool|<\/?(invoke|function_calls|tool_call)\b/

export interface AgentTurn {
  /** What to say back. */
  reply: string
  /** The user said they're finished, or nothing more can be done. */
  done: boolean
  /** A change is waiting for the user's yes or no. */
  confirming: boolean
}

export interface AgentScope {
  db: D1Database
  access: Access
  /** The families the key in use may record for. */
  families: FamilyAccess[]
  /** Recording only for the family that shared its AI: the user has no key of their own. */
  sharedOnly: boolean
  /**
   * Whose key and which families the conversation runs with. A change starts a new
   * conversation, so what was said with one key never goes to another key's provider.
   */
  keyScope: string
  userId: string
  timeZone: string
  /** The app language replies are in (BCP 47); see replyLanguage. */
  locale: string
  phrase: string
  /** Extra request fields for the provider (modelOptionsFor). */
  modelOptions?: Record<string, unknown>
  /** Overrides TURN_TIMEOUT_MS; tests use a short one. */
  timeoutMs?: number
  /** Called with the reply so far as the model writes it, for the chat to show it growing. */
  onText?: (text: string) => void
  /** The tip the parent came from to ask about it, if any (an id from the tips). */
  tip?: string
}

/**
 * The language replies are in, named in Chinese for the instructions ("中文", "英语"). Only
 * the language matters, not the region: zh-CN and zh-TW are both 中文.
 */
export function replyLanguage(locale: string): string {
  try {
    const { language } = new Intl.Locale(locale)
    return new Intl.DisplayNames('zh-CN', { type: 'language' }).of(language) ?? '中文'
  } catch {
    return '中文'
  }
}

/**
 * The reply without a model's thinking: `<think>…</think>` blocks, and everything before a
 * `</think>` whose opening tag the host dropped. Other models keep their thinking out of the
 * reply on their own (reasoning effort, see modelOptionsFor).
 */
export function withoutThinking(text: string): string {
  const closed = text.replaceAll(/<think>[\s\S]*?<\/think>/g, '')
  const dangling = closed.lastIndexOf('</think>')
  const rest = dangling === -1 ? closed : closed.slice(dangling + '</think>'.length)
  return rest.replace(/<think>[\s\S]*$/, '').trim()
}

/** The tip the parent is asking from, in full, as a line of the instructions. */
function fromTip(id: string | undefined) {
  const tip = id ? tipById(id) : undefined
  if (!tip) return ''
  const text = tipText(tip)
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n')
  return `\n- 家长是从这条贴士点进来问的，没说清问的是什么时，就是在问它：\n${text}`
}

function instructions(scope: AgentScope, now: number, babyLines: string[]) {
  const family = scope.families[0]
  const limit =
    scope.sharedOnly && family
      ? `\n- 现在用的是「${family.alias ?? family.name}」分享的 AI，只能记这个家庭的宝宝。家长要给别的家庭记，就请家长在 Bobo 的 设置 → 我的 AI 里填自己的 key。`
      : ''
  return `你是 Bobo 的育儿助手。家长通过 Siri 或 App 跟你说话：你用工具查看和记录宝宝的喂养、睡眠、尿布等，也回答育儿问题。
规则：
- 用${replyLanguage(scope.locale)}回答，口语化、简短，因为常常是 Siri 读出来的：记录和查记录答一两句；育儿问题最多五句，先说最要紧的做法。不要用列表或 Markdown。回复里只写要对家长说的话，不要写你的分析、计划或工具名。
- 能直接记就直接记，不要反复确认（疑似听错的除外，见下面）。一句话里的几件事用一次 record 调用。
- 能记的：尿布、亲喂、瓶喂、辅食、睡眠、吸奶、体温、用药、生长（体重、身长、头围）、笔记。亲喂、瓶喂、辅食、睡眠、吸奶都能计时：说了持续多久就直接记完成的；说"开始喂奶粉""开始吸奶"就带 timer: true 开始计时（亲喂和睡眠没说多久时自动计时）；说"醒了""喂完了""吸完了"就用 type stop 结束计时，stops 填是哪种。
- 家长说的细节都要记上，不要只记总数：混合喂养说了母乳和奶粉各多少，就填 milk: mixed 和 breastMl、formulaMl；亲喂说了左右各多久，就填 leftMinutes、rightMinutes，side 填先喂的那侧。
- 修改或删除前先用 find_events 找到那条记录。修改直接调用 update_event，不用问家长，改完用一句话说清改了什么（改之前和改之后）。删除调用 delete_event，系统会自动请家长确认，你不用自己问。
- 问到记录的问题时先用 find_events 查，再根据结果回答，不要编造。问下次什么时候喂、睡或换尿布，用 list_babies 的 next 回答，说「大约」，这只是参考。
- 记录或修改前，对照下面每个宝宝的月龄参考和最近习惯。数值、时间或类型明显不合理时，比如远超参考范围、和最近习惯差好几倍、时间在将来、还不吃辅食的月龄记了辅食，很可能是语音识别听错了（十五和五十、一百和一千、十四和四十、上午和下午、喂奶和尿布）。这时这一轮不要调用 record 或 update_event（也不要先记上再说可以改），只用一句话问家长，说出你猜的正确值，例如"是 50 毫升吗？"。家长确认后，带上 confirmed: true 再调用 record 或 update_event。数值合理就直接记，不要多问。
- 育儿问题（喂养、睡眠、发育、护理、安全、陪玩等）直接回答，不要当成要记的笔记，除非家长要你记。先用 read_tips 读下面贴士目录里相关的贴士，问到某个宝宝时带上 baby 读它这个月龄的情况，以贴士为准、结合宝宝的月龄回答；问的是宝宝自己的情况，再用 find_events 看记录。贴士没写到的，按 AAP、WHO 等公认的建议回答，拿不准就直说。不诊断，不说药物剂量。像生病了或符合要看医生的情形，就建议带宝宝看医生；呼吸困难、抽搐、叫不醒这类危急情况，让家长马上就医。
- 记完或答完后，问一句"还有吗？"。家长说没有了、好了、谢谢，就调用 end_conversation 并简短道别。
- 能记录的宝宝如下，括号里是家庭名，用于区分重名的宝宝，记录时要带上。没说名字且只有一个宝宝时就是这个宝宝。
${babyLines.map((line) => `  ${line}`).join('\n') || '  （还没有宝宝）'}${limit}
- 贴士目录（id：标题（简介））：
${tipIndex()
  .map((line) => `  ${line}`)
  .join('\n')}${fromTip(scope.tip)}
- 现在是 ${localNow(now, scope.timeZone)}。`
}

/** What the user hears when the model call failed or went wrong. */
export const FAILED_REPLY = '没处理好，请再说一遍。'

/** Every thread of a user starts with this, so deleting the account can find them all. */
export const threadPrefix = (userId: string) => `voice_${userId}_`

/**
 * Every thread of a user as a key range, `thread_id >= ?from and thread_id < ?to`, which
 * the thread_id indexes serve (a substr() match would scan the table).
 */
export function threadRange(userId: string) {
  const from = threadPrefix(userId)
  const to = from.slice(0, -1) + String.fromCharCode(from.charCodeAt(from.length - 1) + 1)
  return { from, to }
}

/** The thread the user's next message goes to: the current one, or a new one after a pause. */
export async function currentThread(db: D1Database, scope: AgentScope, now: number) {
  const row = await db
    .prepare(
      `select thread_id as threadId, thread_active_at as activeAt, thread_scope as keyScope
       from voice_settings where user_id = ?`,
    )
    .bind(scope.userId)
    .first<{ threadId: string | null; activeAt: number | null; keyScope: string | null }>()
  const fresh =
    !row?.threadId ||
    row.activeAt === null ||
    now - row.activeAt > SESSION_IDLE_MS ||
    row.keyScope !== scope.keyScope
  const threadId = fresh ? `${threadPrefix(scope.userId)}${newId(now)}` : (row.threadId ?? '')
  await db
    .prepare(
      `insert into voice_settings (user_id, phrase, time_zone, thread_id, thread_active_at,
         thread_scope, updated_at)
       values (?1, ?2, ?3, ?4, ?5, ?6, ?5)
       on conflict (user_id) do update set thread_id = excluded.thread_id,
         thread_active_at = excluded.thread_active_at, thread_scope = excluded.thread_scope`,
    )
    .bind(scope.userId, scope.phrase, scope.timeZone, threadId, now, scope.keyScope)
    .run()
  return threadId
}

/** "要删除「小米粒 10:32 换尿布（尿尿）」吗？" for a change waiting for approval. */
async function confirmQuestion(scope: AgentScope, metadata: Record<string, unknown>) {
  const toolName = metadata.toolName
  const input = metadata.input
  const id =
    typeof input === 'object' && input !== null && 'id' in input && typeof input.id === 'string'
      ? input.id
      : ''
  const [event] = await eventsByIds(scope.db, [id])
  const babies = await writableBabies(scope.db, scope.families)
  // Nothing about a record outside the user's babies, whatever id the model passed.
  const baby = event && babies.find((item) => item.id === event.babyId)
  const what =
    event && baby
      ? `${baby.name} ${formatClock(event.startAt, scope.timeZone)} ${describe(event, null)}`
      : '这条记录'
  return toolName === 'delete_event' ? `要删除「${what}」吗？` : `要修改「${what}」吗？`
}

interface RunOutcome {
  text: string
  /** Approvals the run stopped for, with what they would do. */
  approvals: Array<Record<string, unknown>>
  error: string | null
}

async function runChat(
  adapter: AnyTextAdapter,
  ctx: AgentContext,
  scope: AgentScope,
  input: { messages: Array<{ role: 'user'; content: string }> } | { resume: RunAgentResumeItem[] },
  babyLines: string[],
  abortController: AbortController,
): Promise<RunOutcome> {
  let text = ''
  const approvals: Array<Record<string, unknown>> = []
  let error: string | null = null
  const options = {
    adapter,
    threadId: ctx.threadId,
    runId: ctx.runId,
    systemPrompts: [instructions(scope, ctx.now, babyLines)],
    tools: agentTools(ctx),
    abortController,
    modelOptions: scope.modelOptions,
    // Once a change is saved the turn ends: its summary is the answer, with no model call
    // to word it, which would keep Siri waiting.
    agentLoopStrategy: (state: AgentLoopState) =>
      maxIterations(MAX_STEPS)(state) && ctx.state.saved.length === 0,
    middleware: [
      withPersistence(chatPersistence(scope.db)),
      withCompaction({
        maxTokens: 12_000,
        strategy: composeStrategies(clearToolResults(), evictOldest()),
      }),
    ],
  }
  const stream =
    'messages' in input
      ? chat({ ...options, messages: input.messages })
      : chat({ ...options, messages: [], resume: input.resume })
  try {
    for await (const chunk of stream) {
      if (chunk.type === EventType.TEXT_MESSAGE_START) text = ''
      if (chunk.type === EventType.TEXT_MESSAGE_CONTENT) {
        text += chunk.delta
        // A tool call written as text is never shown, even while it is being written.
        const shown = withoutThinking(text)
        if (shown && !RAW_TOOL_CALL.test(shown)) scope.onText?.(shown)
      }
      if (chunk.type === EventType.RUN_ERROR) error = chunk.message
      if (chunk.type === EventType.RUN_FINISHED && chunk.outcome?.type === 'interrupt') {
        for (const interrupt of chunk.outcome.interrupts) {
          if (interrupt.metadata) approvals.push(interrupt.metadata)
        }
      }
    }
  } catch (thrown) {
    if (!abortController.signal.aborted) throw thrown
  }
  // Out of time: whatever was said so far is not an answer.
  if (abortController.signal.aborted) error = 'timed out'
  return { text: withoutThinking(text), approvals, error }
}

/**
 * One message from the user. While a change waits for approval, the model reads whether the
 * message approves or refuses it; anything else refuses it and is then handled as a new
 * message.
 */
export async function runAgent(
  adapter: AnyTextAdapter,
  scope: AgentScope,
  text: string,
  now: number,
): Promise<AgentTurn> {
  const threadId = await currentThread(scope.db, scope, now)
  const state = { done: false, saved: [] as string[] }
  const context = (): AgentContext => ({
    ...scope,
    threadId,
    runId: `run_${newId(Date.now())}`,
    now,
    state,
  })
  const babyLines = await describeBabies(
    scope.db,
    await writableBabies(scope.db, scope.families),
    now,
    scope.timeZone,
  )
  const persistence = chatPersistence(scope.db)
  const pending = await persistence.stores.interrupts.listPending(threadId)
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), scope.timeoutMs ?? TURN_TIMEOUT_MS)
  try {
    let outcome: RunOutcome | null = null
    if (pending.length > 0) {
      const metadata = pending[0]?.payload.metadata
      const question = isRecord(metadata)
        ? await confirmQuestion(scope, metadata)
        : '要修改这条记录吗？'
      const answer = await answerTo(adapter, scope, question, text, abort)
      const approved = answer === 'yes'
      // The question named only the first change: a yes approves that one, never the others.
      const resume: RunAgentResumeItem[] = pending.map((item, index) => ({
        interruptId: item.interruptId,
        status: 'resolved',
        payload: { approved: approved && index === 0 },
      }))
      outcome = await runChat(adapter, context(), scope, { resume }, babyLines, abort)
      // Answered either way, also when the run stopped early or ran out of time before the
      // library marked them; left pending, the next message would be read as the answer.
      await Promise.all(
        resume.map((item) => persistence.stores.interrupts.resolve(item.interruptId, item.payload)),
      )
      if (answer === null) outcome = null
    }
    outcome ??= await runChat(
      adapter,
      context(),
      scope,
      { messages: [{ role: 'user', content: text }] },
      babyLines,
      abort,
    )

    // What was saved is the answer, even when the run ran out of time afterwards. No model
    // wrote it, so it joins the conversation here, for the chat box and the next message.
    if (state.saved.length > 0) {
      const reply = `${state.saved.join('。')}。还有吗？`
      const { messages } = persistence.stores
      const thread = await messages.loadThread(threadId)
      await messages.saveThread(threadId, [...thread, { role: 'assistant', content: reply }])
      return { reply, done: false, confirming: false }
    }
    if (outcome.error || RAW_TOOL_CALL.test(outcome.text)) {
      if (!outcome.error)
        console.error('Model wrote a tool call as text', outcome.text.slice(0, 200))
      return { reply: FAILED_REPLY, done: false, confirming: false }
    }
    const first = outcome.approvals[0]
    if (first) return { reply: await confirmQuestion(scope, first), done: false, confirming: true }
    return { reply: outcome.text || '好的。', done: state.done, confirming: false }
  } finally {
    clearTimeout(timer)
    // How long Siri waited, to see in the Worker's logs when it gives up.
    console.log('Voice turn', {
      ms: Date.now() - now,
      saved: state.saved.length,
      timedOut: abort.signal.aborted,
    })
  }
}
