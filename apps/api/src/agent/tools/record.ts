import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

import { runningEvents, writeChanges } from '../data'
import { voiceActionSchema } from '../plan/action'
import { planActions } from '../plan/plan'
import { REFUSED, type ToolContext, confirmedSchema, doubt, resultSchema } from './shared'

/** Adds records and starts and stops timers. */
export function record(ctx: ToolContext) {
  const { db, access, userId, now, timeZone, babies, log, saved } = ctx
  return toolDefinition({
    name: 'record',
    description:
      'Add records, start timers and stop them (type stop: "醒了", "喂完了", "吸完了"). Use ' +
      'one call for everything said in one sentence.',
    inputSchema: z.object({
      actions: z.array(voiceActionSchema).min(1),
      confirmed: confirmedSchema,
      ask: z
        .string()
        .optional()
        .meta({
          description:
            'One short question about something else the parent said that is not clear enough ' +
            'to record yet, asked after what was recorded',
        }),
    }),
    outputSchema: resultSchema,
  }).server(async ({ actions, confirmed, ask }) => {
    const known = await babies()
    const running = await runningEvents(db, known)
    const plan = planActions(
      actions.filter((action) => action.type !== 'undo'),
      {
        babies: known,
        running,
        userId,
        now,
        timeZone,
      },
    )
    if (plan.kind !== 'changes')
      return { ok: false, message: plan.kind === 'reply' ? plan.reply : '' }
    if (!confirmed) {
      const doubted = doubt(plan.changes, known, now, timeZone)
      if (doubted) return doubted
    }
    const refused = await writeChanges(db, access, userId, log, plan.changes, now)
    if (refused) return { ok: false, message: REFUSED[refused] ?? refused }
    if (ask?.trim()) ctx.state.ask = ask.trim()
    return saved(`已记录：${plan.lines.join('；')}`)
  })
}
