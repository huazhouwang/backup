import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

import { type Change, writeChanges } from '../data'
import { REFUSED, type ToolContext, line, resultSchema } from './shared'

/** Deletes one record, once the user approves. */
export function deleteEvent(ctx: ToolContext) {
  const { db, access, userId, now, timeZone, log, saved, ownEvent } = ctx
  return toolDefinition({
    name: 'delete_event',
    description:
      "Delete one record (its id from find_events). Needs the user's approval, which they " +
      'give in their next message.',
    inputSchema: z.object({ id: z.string() }),
    outputSchema: resultSchema,
    needsApproval: true,
  }).server(async ({ id }) => {
    const found = await ownEvent(id)
    if (!found) return { ok: false, message: '找不到这条记录。' }
    const { event, known } = found
    const change: Change = { event: { ...event, deletedAt: now, updatedAt: now }, before: event }
    const refused = await writeChanges(db, access, userId, log, [change], now)
    if (refused) return { ok: false, message: REFUSED[refused] ?? refused }
    return saved(`已删除：${line(event, null, known, timeZone)}`)
  })
}
