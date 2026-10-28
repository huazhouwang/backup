import { DAY } from '@lullabo/shared'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

import { recentEvents, runningEvents } from '../data'
import { nextUpLines } from '../guide'
import { type ToolContext, line } from './shared'

/** Enough of the last week for nextUp, and a night that started before it. */
const NEXT_UP_HISTORY = 15 * DAY

/** The babies, their running timers and what likely comes next. */
export function listBabies(ctx: ToolContext) {
  const { db, now, timeZone, babies } = ctx
  return toolDefinition({
    name: 'list_babies',
    description:
      "The family's babies, the timers each has running, and what likely comes next for " +
      'each (feeds, sleep, diapers), from their age and last week.',
    inputSchema: z.object({}),
    outputSchema: z.object({
      babies: z.array(
        z.object({ name: z.string(), running: z.array(z.string()), next: z.array(z.string()) }),
      ),
    }),
  }).server(async () => {
    const known = await babies()
    const running = await runningEvents(db, known)
    const recent = await recentEvents(
      db,
      known.map((baby) => baby.id),
      now - NEXT_UP_HISTORY,
      null,
      2000,
    )
    return {
      babies: known.map((baby) => ({
        name: baby.name,
        running: running
          .filter((event) => event.babyId === baby.id)
          .map((event) => line(event, null, known, timeZone)),
        next: nextUpLines(
          recent.filter((event) => event.babyId === baby.id),
          baby.birthDate,
          now,
          timeZone,
        ),
      })),
    }
  })
}
