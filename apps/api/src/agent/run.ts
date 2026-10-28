import { newId } from '@lullabo/shared'
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

import { answerTo, confirmQuestion } from './confirm'
import { writableBabies } from './data'
import { describeBabies } from './guide'
import { chatPersistence } from './persistence'
import { instructions } from './prompt'
import type { AgentScope, AgentTurn } from './scope'
import { RAW_TOOL_CALL, withoutThinking } from './text'
import { currentThread } from './threads'
import { agentTools } from './tools'
import type { AgentContext } from './tools/shared'

/** Model calls per message: enough to look something up, act on it and answer. */
const MAX_STEPS = 6
/** A whole turn, every model call in it, gets this long: Siri does not wait much longer. */
export const TURN_TIMEOUT_MS = 25_000

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** What the user hears when the model call failed or went wrong. */
export const FAILED_REPLY = '没处理好，请再说一遍。'

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
