import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

import { undoLastTurn } from '../data'
import { REFUSED, type ToolContext, line, resultSchema } from './shared'

/** Undoes the conversation's latest change. */
export function undo(ctx: ToolContext) {
  const { db, access, userId, now, timeZone, babies, saved } = ctx
  return toolDefinition({
    name: 'undo',
    description: 'Undo what the latest change in this conversation did ("撤销", "记错了").',
    inputSchema: z.object({}),
    outputSchema: resultSchema,
  }).server(async () => {
    const known = await babies()
    const babyIds = new Set(known.map((baby) => baby.id))
    const result = await undoLastTurn(db, access, userId, ctx.threadId, babyIds, now)
    if ('refused' in result)
      return { ok: false, message: REFUSED[result.refused] ?? result.refused }
    if (result.reverted.length === 0) return { ok: false, message: '没有可以撤销的操作。' }
    return saved(
      `已撤销：${result.reverted.map((event) => line(event, null, known, timeZone)).join('；')}`,
    )
  })
}
