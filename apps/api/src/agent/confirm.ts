import { type AnyTextAdapter, chat } from '@tanstack/ai'
import { z } from 'zod'

import { formatClock } from '../time-zone'
import { eventsByIds, writableBabies } from './data'
import { describe } from './plan/plan'
import type { AgentScope } from './scope'

const answerSchema = z.object({ answer: z.enum(['yes', 'no', 'other']) })

/**
 * How the user answered "要修改…吗？", in whatever words or language: yes, no, or null when
 * they said something else ("不是五点，是六点"), which is then a new message.
 */
export async function answerTo(
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

/** "要删除「小米粒 10:32 换尿布（尿尿）」吗？" for a change waiting for approval. */
export async function confirmQuestion(scope: AgentScope, metadata: Record<string, unknown>) {
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
