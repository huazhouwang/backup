import { EVENT_TYPES } from '@lullabo/shared'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

import { recentEvents } from '../data'
import { type ToolContext, line } from './shared'

/** Recent records, to answer questions and find one to change. */
export function findEvents(ctx: ToolContext) {
  const { db, now, timeZone, babies } = ctx
  return toolDefinition({
    name: 'find_events',
    description:
      'Recent records, newest first, with ids for update_event and delete_event. Use it to ' +
      'answer questions ("上次喂奶是什么时候", "今天喝了多少") and to find a record to change.',
    inputSchema: z.object({
      baby: z.string().nullable().meta({ description: 'Baby name, or null for all' }),
      type: z.enum(EVENT_TYPES).nullable(),
      hours: z
        .number()
        .min(1)
        .max(24 * 14)
        .meta({ description: 'How far back to look' }),
    }),
    outputSchema: z.object({
      events: z.array(z.object({ id: z.string(), date: z.string(), summary: z.string() })),
    }),
  }).server(async ({ baby, type, hours }) => {
    const known = await babies()
    const chosen = baby ? known.filter((item) => item.name.includes(baby)) : known
    const events = await recentEvents(
      db,
      chosen.map((item) => item.id),
      now - hours * 3_600_000,
      type,
      50,
    )
    return {
      events: events.map((event) => ({
        id: event.id,
        date: new Intl.DateTimeFormat('zh-CN', {
          timeZone,
          month: 'numeric',
          day: 'numeric',
        }).format(event.startAt),
        summary: line(event, null, known, timeZone),
      })),
    }
  })
}
